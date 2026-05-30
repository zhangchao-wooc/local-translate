import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import Editor, { type OnChange } from "@monaco-editor/react";
import { useLocalStorageState } from "ahooks";
import { useLocation, useNavigate } from "react-router";
import styles from "./index.module.css";
import {
  parseBinaryDocument,
  parseDocument,
} from "../../modules/translate/format";
import {
  listDirectoryFiles,
  mergeAndWriteLanguageFile,
  pickInputFile,
  mergeAndWriteTranslatedFile,
  pickOutputDirectory,
  supportsFileSystemAccess,
  type DirectoryFileItem,
  type FileChangeSet,
  type PickedOutput,
} from "../../modules/translate/file-system";
import {
  clearOutputDirectoryHandle,
  loadOutputDirectoryHandle,
  saveOutputDirectoryHandle,
} from "../../modules/translate/handle-storage";
import { runTranslation } from "../../modules/translate/translator";
import type { TranslateConfig } from "../../modules/translate/types";
import { appendOperationRecord } from "../../modules/operation-history/storage";
import { LanguageList } from "../../common/language";
import {
  DEFAULT_OUTPUT_FILE_FORMAT,
  type OutputFileFormat,
} from "../../common/file-format";

type MatchedOutputFile = {
  fileName: string;
  format: OutputFileFormat;
};

type SourceLanguageOption = {
  label: string;
  value: string;
  fileName: string;
};

type AddLanguageFormValues = {
  sourceLanguage: string;
  targetLanguages: Array<{ key: string }>;
};

let cachedOutputSelection: PickedOutput | null = null;

const resolveLanguageFileBaseName = (
  languageTag: string,
  rule: TranslateConfig["file"]["languageFileNameRule"] = "hyphen",
  mapping?: Record<string, string>,
): string => {
  const byRule =
    rule === "underscore"
      ? languageTag.replace(/-/g, "_")
      : rule === "language"
        ? languageTag.split("-")[0] || languageTag
        : languageTag;
  const customMapped = mapping?.[languageTag];
  const isRuleGeneratedValue =
    customMapped === languageTag ||
    customMapped === languageTag.replace(/-/g, "_") ||
    customMapped === (languageTag.split("-")[0] || languageTag);
  return customMapped && !isRuleGeneratedValue ? customMapped : byRule;
};

const getMatchedOutputFiles = (
  files: DirectoryFileItem[],
  config?: TranslateConfig,
): MatchedOutputFile[] => {
  if (!config) return [];

  const expectedBaseNames = new Set(
    LanguageList.map((item) =>
      resolveLanguageFileBaseName(
        item.value,
        config.file.languageFileNameRule,
        config.file.languageFileNameMap,
      ),
    ),
  );

  return files
    .filter(
      (item) =>
        item.extension ===
        (config.file.outputFileFormat || DEFAULT_OUTPUT_FILE_FORMAT),
    )
    .filter((item) => {
      const idx = item.fileName.lastIndexOf(".");
      const baseName = idx >= 0 ? item.fileName.slice(0, idx) : item.fileName;
      return expectedBaseNames.has(baseName);
    })
    .map((item) => ({
      fileName: item.fileName,
      format: item.extension as OutputFileFormat,
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
};

const normalizeLanguageKey = (key: string): string =>
  key.toLowerCase().replace(/[-_]/g, "");

const isEnglishLanguageKey = (key: string): boolean =>
  normalizeLanguageKey(key).startsWith("en");

const getSourceLanguageOptions = (
  files: DirectoryFileItem[],
  config?: TranslateConfig,
): SourceLanguageOption[] => {
  if (!config) return [];
  const ext = config.file.outputFileFormat || DEFAULT_OUTPUT_FILE_FORMAT;

  return files
    .filter((item) => item.extension === ext)
    .map((item) => {
      const idx = item.fileName.lastIndexOf(".");
      const baseName = idx >= 0 ? item.fileName.slice(0, idx) : item.fileName;
      return { label: baseName, value: baseName, fileName: item.fileName };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
};

const toSuggestedLanguageKey = (
  input: string,
  rule: TranslateConfig["file"]["languageFileNameRule"] = "hyphen",
): string => {
  const compact = input.trim().replace(/\.[^.]+$/, "");
  const parts = compact.split(/[-_]/).filter(Boolean);
  const language = (parts[0] || compact).toLowerCase();
  const region = parts[1]?.toUpperCase();
  if (rule === "language") return language;
  if (!region) return language;
  return rule === "underscore"
    ? `${language}_${region}`
    : `${language}-${region}`;
};

const isKeyMatchingRule = (
  key: string,
  rule: TranslateConfig["file"]["languageFileNameRule"] = "hyphen",
): boolean => {
  if (rule === "language") return /^[a-z]{2,3}$/.test(key);
  if (rule === "underscore") return /^[a-z]{2,3}_[A-Z]{2,3}$/.test(key);
  return /^[a-z]{2,3}-[A-Z]{2,3}$/.test(key);
};

const HomePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [messageApi, contextHolder] = message.useMessage();
  const [addLanguageForm] = Form.useForm<AddLanguageFormValues>();
  const [config, setConfig] = useLocalStorageState<TranslateConfig>("config");
  const [output, setOutput] = useState<PickedOutput | null>(
    cachedOutputSelection,
  );
  const [sourceText, setSourceText] = useState('{\n  "name": "name"\n}');
  const [lastChangeLog, setLastChangeLog] = useState<FileChangeSet | null>(
    null,
  );
  const [matchedOutputFiles, setMatchedOutputFiles] = useState<
    MatchedOutputFile[]
  >([]);
  const [sourceLanguageOptions, setSourceLanguageOptions] = useState<
    SourceLanguageOption[]
  >([]);
  const [addLanguageModalOpen, setAddLanguageModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fsSupported = useMemo(() => supportsFileSystemAccess(), []);
  const currentFileRule = config?.file.languageFileNameRule || "hyphen";
  const sourceEntryCount = useMemo(() => {
    try {
      const parsed = JSON.parse(sourceText.trim()) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.keys(parsed).length
        : 0;
    } catch {
      return 0;
    }
  }, [sourceText]);
  const existingFileBaseNameSet = useMemo(
    () =>
      new Set(sourceLanguageOptions.map((item) => item.value.toLowerCase())),
    [sourceLanguageOptions],
  );

  useEffect(() => {
    if (!fsSupported || cachedOutputSelection?.handle) return;

    const restoreOutputHandle = async () => {
      try {
        const handle = await loadOutputDirectoryHandle();
        if (!handle) return;
        const nextOutput = { handle };
        setOutput(nextOutput);
        cachedOutputSelection = nextOutput;
      } catch {
        // Ignore restore errors and keep current empty state.
      }
    };

    restoreOutputHandle();
  }, [fsSupported]);

  useEffect(() => {
    const outputHandle = output?.handle;
    if (!outputHandle) {
      setMatchedOutputFiles([]);
      setSourceLanguageOptions([]);
      return;
    }

    const refreshMatchedFiles = async () => {
      const files = await listDirectoryFiles(outputHandle);
      setMatchedOutputFiles(getMatchedOutputFiles(files, config || undefined));
      setSourceLanguageOptions(
        getSourceLanguageOptions(files, config || undefined),
      );
    };

    refreshMatchedFiles().catch(() => {
      setMatchedOutputFiles([]);
      setSourceLanguageOptions([]);
    });
  }, [
    location.key,
    output?.handle,
    config?.file.outputFileFormat,
    config?.file.languageFileNameRule,
    config?.file.languageFileNameMap,
  ]);

  const options = {
    minimap: { enabled: false },
    fontSize: 14,
    automaticLayout: true,
    formatOnPaste: true,
    formatOnType: true,
    scrollBeyondLastLine: false,
    padding: {
      top: 15,
      bottom: 15,
    },
  };

  const isUserCancelSelection = (error: unknown): boolean => {
    if (error instanceof DOMException && error.name === "AbortError") {
      return true;
    }
    if (error instanceof Error) {
      return (
        error.name === "AbortError" ||
        error.message === "No file selected" ||
        error.message.includes("aborted")
      );
    }
    return false;
  };

  const selectInputFile = async () => {
    try {
      const picked = await pickInputFile();
      const parsed = picked.arrayBuffer
        ? parseBinaryDocument(picked.arrayBuffer, picked.fileName)
        : parseDocument(picked.text, picked.fileName);
      setSourceText(`${JSON.stringify(parsed.source, null, 2)}\n`);
    } catch (error) {
      if (isUserCancelSelection(error)) {
        messageApi.info("已取消选择");
        return;
      }
      messageApi.error((error as Error).message);
    }
  };

  const selectOutputDirectory = async () => {
    try {
      const selected = await pickOutputDirectory();
      setOutput(selected);
      cachedOutputSelection = selected;
      if (selected.handle) {
        await saveOutputDirectoryHandle(selected.handle);
      } else {
        await clearOutputDirectoryHandle();
      }

      if (selected.handle) {
        const files = await listDirectoryFiles(selected.handle);
        setMatchedOutputFiles(
          getMatchedOutputFiles(files, config || undefined),
        );
      } else {
        setMatchedOutputFiles([]);
      }

      if (config) {
        const nextConfig: TranslateConfig = {
          ...config,
          file: {
            ...config.file,
            outputPath: selected.handle?.name || config.file.outputPath,
          },
        };
        setConfig(nextConfig);
      }

      messageApi.success(
        selected.handle
          ? `已选择输出目录: ${selected.handle.name}`
          : "当前浏览器将使用下载模式输出",
      );
    } catch (error) {
      if (isUserCancelSelection(error)) {
        messageApi.info("已取消选择");
        return;
      }
      messageApi.error((error as Error).message);
    }
  };

  const confirmCreateMissingFile = (fileName: string): Promise<boolean> => {
    return new Promise((resolve) => {
      Modal.confirm({
        title: "未找到目标文件",
        content: `目录下没有文件名为 ${fileName} 的文件，是否创建？`,
        okText: "创建",
        cancelText: "取消",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const formatChangeLine = (change: {
    key: string;
    before?: unknown;
    after?: unknown;
  }): string => {
    if (change.before !== undefined && change.after !== undefined) {
      return `${change.key}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`;
    }
    if (change.after !== undefined) {
      return `${change.key}: ${JSON.stringify(change.after)}`;
    }
    return `${change.key}: ${JSON.stringify(change.before)}`;
  };

  const renderChangeLogText = (changes: FileChangeSet): string => {
    const lines: string[] = [`文件: ${changes.fileName}`];
    lines.push(`新建文件: ${changes.created ? "是" : "否"}`);
    lines.push(`更新(${changes.updated.length}):`);
    lines.push(...changes.updated.map((item) => `- ${formatChangeLine(item)}`));
    lines.push(`新增(${changes.added.length}):`);
    lines.push(...changes.added.map((item) => `- ${formatChangeLine(item)}`));
    lines.push(`删除(${changes.deleted.length}):`);
    lines.push(...changes.deleted.map((item) => `- ${formatChangeLine(item)}`));
    return lines.join("\n");
  };

  const showChangeResultModal = (changes: FileChangeSet) => {
    Modal.info({
      title: "本次操作变更",
      width: 720,
      content: (
        <pre className={styles.changeLogPre}>
          {renderChangeLogText(changes)}
        </pre>
      ),
      okText: "确定",
    });
  };

  const executeTranslation = async () => {
    if (!config) {
      messageApi.error("配置未初始化，请先到设置页保存配置");
      return;
    }
    if (!output?.handle) {
      messageApi.error("请先选择输出目录后再执行写回");
      return;
    }

    const trimmedSourceText = sourceText.trim();
    if (!trimmedSourceText) {
      messageApi.warning("新增翻译内容为空，请先填写后再执行翻译");
      return;
    }

    let parsedSource: Record<string, unknown>;
    try {
      parsedSource = JSON.parse(trimmedSourceText) as Record<string, unknown>;
    } catch {
      messageApi.error("新增翻译内容不是有效的 JSON，请修正后重试");
      return;
    }

    if (
      !parsedSource ||
      typeof parsedSource !== "object" ||
      Array.isArray(parsedSource) ||
      Object.keys(parsedSource).length === 0
    ) {
      messageApi.warning("新增翻译 JSON 为空，请至少提供一条键值后再执行翻译");
      return;
    }

    setProcessing(true);
    try {
      const translated = await runTranslation(parsedSource, config);
      const sourceFileName = `${config.file.sourceLanguage}.json`;

      const sourceWriteResult = await mergeAndWriteLanguageFile(
        sourceFileName,
        config.file.sourceLanguage,
        parsedSource,
        config,
        output || {},
        confirmCreateMissingFile,
      );

      const writeResult = await mergeAndWriteTranslatedFile(
        sourceFileName,
        translated.language,
        translated.content,
        config,
        output || {},
        confirmCreateMissingFile,
      );

      if (writeResult.mode === "direct") {
        messageApi.success(
          `翻译并写回成功: 源文件 ${sourceWriteResult.fileName}，目标文件 ${writeResult.fileName}`,
        );
        if (writeResult.changes) {
          setLastChangeLog(writeResult.changes);
          showChangeResultModal(writeResult.changes);
          appendOperationRecord({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            operatedAt: new Date().toISOString(),
            operationConfig: config,
            sourceFileName,
            outputDirectoryName: output.handle?.name || "",
            fileChange: writeResult.changes,
          });
        }
      } else {
        messageApi.success(`翻译成功，已下载文件: ${writeResult.fileName}`);
      }
    } catch (error) {
      messageApi.error((error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const openAddLanguageModal = () => {
    if (!output?.handle) {
      messageApi.error("请先选择输出目录");
      return;
    }
    if (sourceLanguageOptions.length === 0) {
      messageApi.error("输出目录未解析到可用语言文件");
      return;
    }

    const englishOption = sourceLanguageOptions.find((item) =>
      isEnglishLanguageKey(item.value),
    );
    const defaultSourceLanguage =
      englishOption?.value || sourceLanguageOptions[0].value;

    addLanguageForm.setFieldsValue({
      sourceLanguage: defaultSourceLanguage,
      targetLanguages: [{ key: "" }],
    });
    setAddLanguageModalOpen(true);
  };

  const executeAddLanguageTranslation = async () => {
    if (!config) {
      messageApi.error("配置未初始化，请先到设置页保存配置");
      return;
    }
    if (!output?.handle) {
      messageApi.error("请先选择输出目录后再执行写回");
      return;
    }

    try {
      const values = await addLanguageForm.validateFields();
      const sourceOption = sourceLanguageOptions.find(
        (item) => item.value === values.sourceLanguage,
      );
      if (!sourceOption) {
        messageApi.error("源语言文件不存在，请重新选择");
        return;
      }

      const targetLanguages = (values.targetLanguages || [])
        .map((item) => item?.key?.trim())
        .filter((key): key is string => Boolean(key));
      const uniqueTargets = Array.from(new Set(targetLanguages)).filter(
        (key) => key !== values.sourceLanguage,
      );

      if (uniqueTargets.length === 0) {
        messageApi.error("请至少填写一个有效的新语言 key");
        return;
      }

      setProcessing(true);
      const sourceHandle = await output.handle.getFileHandle(
        sourceOption.fileName,
      );
      const sourceFile = await sourceHandle.getFile();
      const parsedSource = sourceOption.fileName.toLowerCase().endsWith(".xlsx")
        ? parseBinaryDocument(
            await sourceFile.arrayBuffer(),
            sourceOption.fileName,
          )
        : parseDocument(await sourceFile.text(), sourceOption.fileName);

      for (const targetKey of uniqueTargets) {
        const translated = await runTranslation(
          parsedSource.source,
          config,
          targetKey,
        );
        await mergeAndWriteLanguageFile(
          sourceOption.fileName,
          targetKey,
          translated.content,
          config,
          output,
          confirmCreateMissingFile,
        );
      }

      setAddLanguageModalOpen(false);
      messageApi.success(`新增语言写回成功，共 ${uniqueTargets.length} 个`);
      const files = await listDirectoryFiles(output.handle);
      setMatchedOutputFiles(getMatchedOutputFiles(files, config));
      setSourceLanguageOptions(getSourceLanguageOptions(files, config));
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "errorFields" in error
      ) {
        return;
      }
      messageApi.error((error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleEditorChange: OnChange = (newValue) => {
    setSourceText(newValue || "");
  };

  return (
    <div className={styles.home}>
      {contextHolder}
      {!fsSupported && (
        <Alert
          type="warning"
          showIcon
          message="当前浏览器不支持 File System Access API，将自动使用上传/下载模式。"
        />
      )}
      <header className={styles.header}>
        <Typography.Text strong>输出文件夹</Typography.Text>
        <div className={styles.outputFilesPanel}>
          <div className={styles.headerActions}>
            <div className={styles.meta}>
              <Button type="primary" onClick={selectOutputDirectory}>
                选择输出目录
              </Button>
              <Button type="primary" onClick={openAddLanguageModal}>
                新增语言
              </Button>
            </div>
            <Typography.Text>
              匹配文件（
              {config?.file.outputFileFormat ||
                DEFAULT_OUTPUT_FILE_FORMAT}）:{" "}
              <Typography.Text style={{ color: "var(--ant-color-primary)" }}>
                {matchedOutputFiles.length}
              </Typography.Text>
            </Typography.Text>
          </div>

          <Tag color="gold">当前输出目录: {output?.handle?.name || ""}</Tag>
          <div className={styles.outputFilesList}>
            {matchedOutputFiles.length > 0 ? (
              matchedOutputFiles.map((item) => (
                <Tag key={item.fileName}>{`${item.fileName}`}</Tag>
              ))
            ) : (
              <Typography.Text type="secondary">
                未发现符合当前文件名规则的{" "}
                {config?.file.outputFileFormat || DEFAULT_OUTPUT_FILE_FORMAT}{" "}
                文件。如需修改文件类型，请前往
                <Typography.Link onClick={() => navigate("/setting")}>
                  设置
                </Typography.Link>
                中修改。
              </Typography.Text>
            )}
          </div>
        </div>

        {lastChangeLog && (
          <div className={styles.changeLog}>
            <pre className={styles.changeLogPre}>
              {renderChangeLogText(lastChangeLog)}
            </pre>
          </div>
        )}
      </header>

      <section className={styles.section}>
        <Space>
          <Typography.Text strong>新增翻译</Typography.Text>
        </Space>
        <div className={styles.panel}>
          <div className={styles.panelActions}>
            <Button onClick={selectInputFile}>选择输入文件</Button>
            <Button
              type="primary"
              loading={processing}
              onClick={executeTranslation}
            >
              执行翻译并写回
            </Button>
            <div className={styles.panelActionsRight}>
              <Space>
                <Typography.Text>
                  词条数:{" "}
                  <Typography.Text style={{ color: "var(--ant-color-primary)" }}>
                    {sourceEntryCount}
                  </Typography.Text>
                </Typography.Text>
              </Space>
            </div>
          </div>
          <Editor
            className={styles.editor}
            width="100%"
            height="100%"
            defaultLanguage="json"
            value={sourceText}
            options={options}
            theme="vs-dark"
            onChange={handleEditorChange}
          />
        </div>
      </section>

      <Modal
        title="新增语言"
        open={addLanguageModalOpen}
        onCancel={() => setAddLanguageModalOpen(false)}
        onOk={executeAddLanguageTranslation}
        okText="确认翻译并写回文件"
        confirmLoading={processing}
        width={720}
      >
        <Form form={addLanguageForm} layout="vertical">
          <Form.Item
            label="源语言"
            name="sourceLanguage"
            rules={[{ required: true, message: "请选择源语言" }]}
          >
            <Select
              options={sourceLanguageOptions}
              showSearch
              optionFilterProp="label"
              placeholder="请选择源语言"
            />
          </Form.Item>
          <Form.List name="targetLanguages">
            {(fields, { add, remove }) => (
              <>
                <Typography.Text
                  strong
                  style={{ display: "block", marginBottom: 8 }}
                >
                  新语言 key
                </Typography.Text>
                {fields.map((field) => (
                  <Space
                    key={field.key}
                    style={{ display: "flex", marginBottom: 8 }}
                    align="center"
                  >
                    <Form.Item
                      {...field}
                      name={[field.name, "key"]}
                      validateTrigger={["onBlur", "onSubmit"]}
                      rules={[
                        { required: true, message: "请输入新语言 key" },
                        {
                          validator: async (_, value?: string) => {
                            const key = (value || "").trim();
                            if (!key) return;

                            if (!isKeyMatchingRule(key, currentFileRule)) {
                              const suggestion = toSuggestedLanguageKey(
                                key,
                                currentFileRule,
                              );
                              throw new Error(
                                `格式不符合当前规则（${currentFileRule}），建议改为：${suggestion}`,
                              );
                            }

                            if (
                              existingFileBaseNameSet.has(key.toLowerCase())
                            ) {
                              throw new Error(
                                `该语言 key 已存在于当前目录：${key}`,
                              );
                            }
                          },
                        },
                      ]}
                      style={{ minWidth: 420, marginBottom: 0 }}
                    >
                      <Input placeholder="如：fr、fr-FR、fr_FR" />
                    </Form.Item>
                    <Button
                      style={{ marginBottom: 0 }}
                      onClick={() => remove(field.name)}
                    >
                      删除
                    </Button>
                  </Space>
                ))}
                <Button onClick={() => add({ key: "" })}>新增输入框</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default HomePage;
