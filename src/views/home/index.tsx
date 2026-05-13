import { useMemo, useState } from "react";
import { Alert, Button, Modal, Space, Tag, Typography, message } from "antd";
import Editor, { type OnChange } from "@monaco-editor/react";
import { useLocalStorageState } from "ahooks";
import { useNavigate } from "react-router";
import styles from "./index.module.css";
import {
  parseDocument,
  serializeDocument,
} from "../../modules/translate/format";
import { normalizePath } from "../../modules/translate/path";
import {
  listDirectoryFiles,
  pickInputFile,
  mergeAndWriteTranslatedFile,
  pickOutputDirectory,
  supportsFileSystemAccess,
  type DirectoryFileItem,
  type FileChangeSet,
  type PickedInput,
  type PickedOutput,
} from "../../modules/translate/file-system";
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

const HomePage = () => {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [config, setConfig] = useLocalStorageState<TranslateConfig>("config");
  const [input, setInput] = useState<PickedInput | null>(null);
  const [output, setOutput] = useState<PickedOutput | null>(null);
  const [sourceText, setSourceText] = useState('{\n  "name": "name"\n}');
  const [translatedText, setTranslatedText] = useState("");
  const [lastChangeLog, setLastChangeLog] = useState<FileChangeSet | null>(
    null,
  );
  const [matchedOutputFiles, setMatchedOutputFiles] = useState<
    MatchedOutputFile[]
  >([]);
  const [processing, setProcessing] = useState(false);
  const fsSupported = useMemo(() => supportsFileSystemAccess(), []);

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
      setInput(picked);
      setSourceText(picked.text);

      if (config) {
        const nextConfig: TranslateConfig = {
          ...config,
          file: {
            ...config.file,
            inputPath: picked.fullPath || picked.fileName,
          },
        };
        setConfig(nextConfig);
      }

      messageApi.success(`已读取文件: ${picked.fileName}`);
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

    setProcessing(true);
    try {
      const parsed = parseDocument(
        sourceText,
        input?.fileName || `${config.file.sourceLanguage}.json`,
      );
      const translated = await runTranslation(parsed.source, config);
      const outputText = serializeDocument(parsed.format, translated.content);
      setTranslatedText(outputText);

      const writeResult = await mergeAndWriteTranslatedFile(
        input?.fileName || `${config.file.sourceLanguage}.json`,
        translated.content,
        config,
        output || {},
        confirmCreateMissingFile,
      );

      if (writeResult.mode === "direct") {
        messageApi.success(`翻译并写回成功: ${writeResult.fileName}`);
        if (writeResult.changes) {
          setLastChangeLog(writeResult.changes);
          showChangeResultModal(writeResult.changes);
          appendOperationRecord({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            operatedAt: new Date().toISOString(),
            operationConfig: config,
            sourceFileName:
              input?.fileName || `${config.file.sourceLanguage}.json`,
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
        <Space wrap>
          <Button onClick={selectInputFile}>选择输入文件</Button>
          <Button onClick={selectOutputDirectory}>选择输出目录</Button>
          <Button
            type="primary"
            loading={processing}
            onClick={executeTranslation}
          >
            执行翻译并写回
          </Button>
        </Space>
        <div className={styles.outputFilesPanel}>
          <Typography.Text strong>
            匹配文件（
            {config?.file.outputFileFormat ||
              DEFAULT_OUTPUT_FILE_FORMAT}）: {matchedOutputFiles.length}
          </Typography.Text>
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
        <div className={styles.meta}>
          <Tag color="blue">
            输入:{" "}
            {input?.fileName ||
              normalizePath(config?.file?.inputPath || "未选择")}
          </Tag>
          <Tag color="gold">
            输出:{" "}
            {output?.handle?.name ||
              normalizePath(config?.file?.outputPath || "下载模式")}
          </Tag>
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
        <div className={styles.panel}>
          <Typography.Text strong>新增翻译</Typography.Text>
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
    </div>
  );
};

export default HomePage;
