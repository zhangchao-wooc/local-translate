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
  buildTargetFileName,
} from "../../modules/translate/format";
import {
  listDirectoryFiles,
  mergeAndWriteLanguageFile,
  pickInputFile,
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
import {
  runMultiLanguageTranslationAdaptive,
  runTranslationAdaptive,
  type TranslationExecutionMeta,
} from "../../modules/translate/translator";
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

type TranslationChangeSummary = {
  affectedFileNames: string[];
  sourceEntries: Record<string, unknown>;
  translatedEntries: Record<string, Record<string, unknown>>;
  fileChanges: FileChangeSet[];
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

const resolveLanguageTagFromFileName = (
  fileName: string,
  config?: TranslateConfig,
): string | null => {
  if (!config) return null;

  const idx = fileName.lastIndexOf(".");
  const baseName = idx >= 0 ? fileName.slice(0, idx) : fileName;

  const matched = LanguageList.find((item) => {
    return (
      resolveLanguageFileBaseName(
        item.value,
        config.file.languageFileNameRule,
        config.file.languageFileNameMap,
      ) === baseName
    );
  });

  return matched?.value || null;
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

const formatTranslationExecutionSummary = (
  executionMetas: TranslationExecutionMeta[],
): string => {
  const chunkedLanguages = executionMetas.filter((item) => item.mode === "chunked");
  const totalChunks = executionMetas.reduce(
    (sum, item) => sum + item.chunkCount,
    0,
  );

  if (chunkedLanguages.length === 0) {
    return "本次翻译已按单次请求执行";
  }

  return `本次翻译已按上下文预算自动分批，共 ${totalChunks} 批`;
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
  const [lastChangeLog, setLastChangeLog] =
    useState<TranslationChangeSummary | null>(null);
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

  const renderChangeLogText = (summary: TranslationChangeSummary): string => {
    const sourceEntryKeys = Object.keys(summary.sourceEntries);
    const lines: string[] = [];
    lines.push(`影响文件(${summary.affectedFileNames.length}):`);
    lines.push(...summary.affectedFileNames.map((fileName) => `- ${fileName}`));
    lines.push(`原词条(${sourceEntryKeys.length}):`);
    lines.push(
      ...sourceEntryKeys.map(
        (key) => `- ${key}: ${JSON.stringify(summary.sourceEntries[key])}`,
      ),
    );
    return lines.join("\n");
  };

  const showChangeResultModal = (summary: TranslationChangeSummary) => {
    Modal.info({
      title: "本次操作变更",
      width: 860,
      content: (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <pre className={styles.changeLogPre}>
            {renderChangeLogText(summary)}
          </pre>
          <div>
            <Typography.Text strong>翻译结果 JSON</Typography.Text>
            <pre className={styles.translationJsonPre}>
              {JSON.stringify(summary.translatedEntries, null, 2)}
            </pre>
          </div>
        </Space>
      ),
      okText: "确定",
    });
  };

  const ensureWritableTargetsReady = async (
    sourceFileName: string,
    languages: string[],
  ): Promise<Set<string>> => {
    if (!config || !output?.handle) return new Set<string>();

    const approvedMissingFiles = new Set<string>();

    for (const language of languages) {
      const fileName = buildTargetFileName(
        sourceFileName,
        language,
        config.file.languageFileNameRule,
        config.file.languageFileNameMap,
      );

      try {
        await output.handle.getFileHandle(fileName);
      } catch {
        const shouldCreate = await confirmCreateMissingFile(fileName);
        if (!shouldCreate) {
          throw new Error(`目标文件 ${fileName} 不存在，已取消写入`);
        }
        approvedMissingFiles.add(fileName);
      }
    }

    return approvedMissingFiles;
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
      const fileExtension =
        config.file.outputFileFormat || DEFAULT_OUTPUT_FILE_FORMAT;
      const sourceFileName = buildTargetFileName(
        `source.${fileExtension}`,
        config.file.sourceLanguage,
        config.file.languageFileNameRule,
        config.file.languageFileNameMap,
      );
      const fileLanguages = Array.from(
        new Set(
          matchedOutputFiles
            .map((item) => resolveLanguageTagFromFileName(item.fileName, config))
            .filter((item): item is string => Boolean(item))
        ),
      );

      if (fileLanguages.length === 0) {
        messageApi.error("输出目录中未找到可写回的语言文件");
        return;
      }

      const translatedContents = new Map<string, Record<string, unknown>>();
      const executionMetas: TranslationExecutionMeta[] = [];

      const targetLanguages = fileLanguages.filter(
        (language) => language !== config.file.sourceLanguage,
      );
      if (fileLanguages.includes(config.file.sourceLanguage)) {
        translatedContents.set(config.file.sourceLanguage, parsedSource);
      }

      if (targetLanguages.length > 0) {
        const translated = await runMultiLanguageTranslationAdaptive(
          parsedSource,
          config,
          targetLanguages,
        );
        targetLanguages.forEach((language) => {
          translatedContents.set(language, translated.contents[language]);
        });
        executionMetas.push(translated.meta);
      }

      const approvedMissingFiles = await ensureWritableTargetsReady(
        sourceFileName,
        fileLanguages,
      );
      const writeResults = [];

      for (const language of fileLanguages) {
        const content = translatedContents.get(language);
        if (!content) {
          throw new Error(`语言 ${language} 的翻译结果缺失，已取消写回`);
        }

        const writeResult = await mergeAndWriteLanguageFile(
          sourceFileName,
          language,
          content,
          config,
          output || {},
          async (fileName) => approvedMissingFiles.has(fileName),
        );
        writeResults.push(writeResult);
      }

      const lastDirectResult = [...writeResults]
        .reverse()
        .find((item) => item.mode === "direct" && item.changes);
      const fileChanges = writeResults
        .map((result) => result.changes)
        .filter((changes): changes is FileChangeSet => Boolean(changes));
      const translatedEntries = Object.fromEntries(
        fileLanguages.map((language) => [
          language,
          translatedContents.get(language) || {},
        ]),
      ) as Record<string, Record<string, unknown>>;

      if (fileChanges.length > 0) {
        const summary: TranslationChangeSummary = {
          affectedFileNames: writeResults.map((result) => result.fileName),
          sourceEntries: parsedSource,
          translatedEntries,
          fileChanges,
        };
        setLastChangeLog(summary);
        showChangeResultModal(summary);

        appendOperationRecord({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          operatedAt: new Date().toISOString(),
          operationConfig: config,
          sourceFileName,
          outputDirectoryName: output.handle?.name || "",
          affectedFileNames: summary.affectedFileNames,
          sourceEntries: summary.sourceEntries,
          translatedEntries: summary.translatedEntries,
          fileChanges: summary.fileChanges,
          fileChange: lastDirectResult?.changes || fileChanges[0],
        });
      }

      const directCount = writeResults.filter(
        (item) => item.mode === "direct",
      ).length;
      const files = await listDirectoryFiles(output.handle);
      setMatchedOutputFiles(getMatchedOutputFiles(files, config));
      setSourceLanguageOptions(getSourceLanguageOptions(files, config));

      if (directCount > 0) {
        messageApi.success(
          `翻译并写回成功，共处理 ${directCount} 个语言文件。${formatTranslationExecutionSummary(executionMetas)}`,
        );
      } else {
        messageApi.success(
          `翻译成功，已输出 ${writeResults.length} 个文件。${formatTranslationExecutionSummary(executionMetas)}`,
        );
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
        const translated = await runTranslationAdaptive(
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
                {fields.map(({ key, ...field }) => (
                  <Space
                    key={key}
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
