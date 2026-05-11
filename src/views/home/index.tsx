import { useMemo, useState } from 'react';
import { Alert, Button, Space, Tag, Typography, message } from 'antd';
import Editor, { type OnChange } from '@monaco-editor/react';
import { useLocalStorageState } from 'ahooks';
import styles from './index.module.css';
import { parseDocument, serializeDocument } from '../../modules/translate/format';
import { normalizePath } from '../../modules/translate/path';
import {
  pickInputFile,
  pickOutputDirectory,
  supportsFileSystemAccess,
  writeTranslatedFile,
  type PickedInput,
  type PickedOutput,
} from '../../modules/translate/file-system';
import { runTranslation } from '../../modules/translate/translator';
import type { TranslateConfig } from '../../modules/translate/types';

const HomePage = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [config, setConfig] = useLocalStorageState<TranslateConfig>('config');
  const [input, setInput] = useState<PickedInput | null>(null);
  const [output, setOutput] = useState<PickedOutput | null>(null);
  const [sourceText, setSourceText] = useState('{\n  "name": "name"\n}');
  const [translatedText, setTranslatedText] = useState('');
  const [processing, setProcessing] = useState(false);
  const fsSupported = useMemo(() => supportsFileSystemAccess(), []);

  const options = {
    minimap: { enabled: false },
    fontSize: 14,
    automaticLayout: true,
    formatOnPaste: true,
    formatOnType: true,
    scrollBeyondLastLine: false,
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
      messageApi.error((error as Error).message);
    }
  };

  const selectOutputDirectory = async () => {
    try {
      const selected = await pickOutputDirectory();
      setOutput(selected);

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
        selected.handle ? `已选择输出目录: ${selected.handle.name}` : '当前浏览器将使用下载模式输出',
      );
    } catch (error) {
      messageApi.error((error as Error).message);
    }
  };

  const executeTranslation = async () => {
    if (!config) {
      messageApi.error('配置未初始化，请先到设置页保存配置');
      return;
    }

    setProcessing(true);
    try {
      const parsed = parseDocument(sourceText, input?.fileName || `${config.file.sourceLanguage}.json`);
      const translated = await runTranslation(parsed.source, config);
      const outputText = serializeDocument(parsed.format, translated.content);
      setTranslatedText(outputText);

      const writeResult = await writeTranslatedFile(
        outputText,
        input?.fileName || `${config.file.sourceLanguage}.json`,
        config,
        output || {},
      );

      if (writeResult.mode === 'direct') {
        messageApi.success(`翻译并写回成功: ${writeResult.fileName}`);
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
    setSourceText(newValue || '');
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
          <Button type="primary" loading={processing} onClick={executeTranslation}>
            执行翻译并写回
          </Button>
        </Space>
        <div className={styles.meta}>
          <Tag color="blue">输入: {input?.fileName || normalizePath(config?.file?.inputPath || '未选择')}</Tag>
          <Tag color="gold">输出: {output?.handle?.name || normalizePath(config?.file?.outputPath || '下载模式')}</Tag>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.panel}>
          <Typography.Text strong>源文件内容</Typography.Text>
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
        <div className={styles.panel}>
          <Typography.Text strong>翻译结果</Typography.Text>
          <Editor
            className={styles.editor}
            width="100%"
            height="100%"
            defaultLanguage="json"
            value={translatedText}
            options={{ ...options, readOnly: true }}
            theme="vs-dark"
          />
        </div>
      </section>
    </div>
  );
};

export default HomePage;
