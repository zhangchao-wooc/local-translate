import { useMemo, useRef, useState } from 'react';
import {
  ProForm,
  ProFormDigit,
  ProFormGroup,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  type ProFormInstance,
} from '@ant-design/pro-components';
import { Button, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import { useLocalStorageState } from 'ahooks';
import { LanguageList } from '../../common/language';
import type { LanguageFileNameRule, TranslateConfig } from '../../modules/translate/types';
import styles from './index.module.css';

type LanguageMapItem = {
  languageTag: string;
  exportFileName: string;
};

const LANGUAGE_FILE_NAME_RULE_OPTIONS: Array<{ label: string; value: LanguageFileNameRule }> = [
  { label: '-', value: 'hyphen' },
  { label: '_', value: 'underscore' },
  { label: '语言标记（例：en）', value: 'language' },
];

const normalizeLanguageTag = (tag: string): string => tag.replace('_', '-');

const normalizeConfig = (config: TranslateConfig): TranslateConfig => {
  const sourceLanguage = normalizeLanguageTag(config.file.sourceLanguage || 'en-US');
  const targetLanguage = normalizeLanguageTag(config.file.targetLanguage || 'zh-CN');
  const oldMap = config.file.languageFileNameMap || {};

  const normalizedMap = Object.entries(oldMap).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[normalizeLanguageTag(key)] = value;
    return acc;
  }, {});

  return {
    ...config,
    file: {
      ...config.file,
      sourceLanguage,
      targetLanguage,
      languageFileNameRule: config.file.languageFileNameRule || 'hyphen',
      languageFileNameMap: normalizedMap,
    },
  };
};

const pickDirectoryPath = async (): Promise<string> => {
  if (window.showDirectoryPicker) {
    const handle = await window.showDirectoryPicker();
    return handle.name;
  }

  const input = document.createElement('input') as HTMLInputElement & { webkitdirectory?: boolean };
  input.type = 'file';
  input.webkitdirectory = true;
  input.click();

  return new Promise((resolve, reject) => {
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('未选择目录'));
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      const dir = relative.split('/')[0] || '';
      if (!dir) return reject(new Error('无法解析目录路径'));
      resolve(dir);
    };
  });
};

const SettingPage = () => {
  const formRef = useRef<ProFormInstance | undefined>(undefined);
  const [mapForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [config, setConfig] = useLocalStorageState<TranslateConfig>('config');

  const initialValues = useMemo(() => {
    if (!config) return undefined;
    const normalized = normalizeConfig(config);
    const languageFileNameMapList: LanguageMapItem[] = Object.entries(normalized.file.languageFileNameMap || {}).map(
      ([languageTag, exportFileName]) => ({ languageTag, exportFileName }),
    );

    return {
      ...normalized,
      file: {
        ...normalized.file,
        languageFileNameMapList,
      },
    };
  }, [config]);

  if (!config || !initialValues) return null;

  return (
    <>
      {contextHolder}
      <ProForm
        formRef={formRef}
        submitter={{
          searchConfig: { submitText: '保存设置', resetText: '重置' },
          resetButtonProps: {
            onClick: (event) => {
              event?.preventDefault();
              Modal.confirm({
                title: '确认重置',
                content: '重置后将恢复为当前已保存配置，未保存的修改将丢失。',
                okText: '确认',
                cancelText: '取消',
                onOk: () => formRef.current?.resetFields(),
              });
            },
          },
          render: (_, doms) => <div className={styles.submitterRight}>{doms}</div>,
        }}
        initialValues={initialValues}
        onFinish={async (value) => {
          const fileValue = (value.file || {}) as TranslateConfig['file'] & {
            languageFileNameMapList?: LanguageMapItem[];
          };

          const languageFileNameMap = (fileValue.languageFileNameMapList || []).reduce<Record<string, string>>(
            (acc, item) => {
              if (!item?.languageTag || !item?.exportFileName) return acc;
              acc[item.languageTag] = item.exportFileName;
              return acc;
            },
            {},
          );

          const nextConfig: TranslateConfig = {
            ...(value as TranslateConfig),
            file: {
              ...fileValue,
              sourceLanguage: normalizeLanguageTag(fileValue.sourceLanguage),
              targetLanguage: normalizeLanguageTag(fileValue.targetLanguage),
              languageFileNameRule: fileValue.languageFileNameRule || 'hyphen',
              languageFileNameMap,
            },
          };

          setConfig(nextConfig);
          messageApi.success('保存成功');
          return true;
        }}
      >
        <div className={styles.section}>
          <Typography.Title level={5}>模型设置</Typography.Title>
          <ProFormText name="model" label="模型名称" width="md" />
          <ProFormGroup>
            <ProFormText name="apiUrl" label="API URL" width="lg" rules={[{ required: true }]} />
            <ProFormText name="apiKey" label="API Key" width="lg" />
          </ProFormGroup>
          <ProFormTextArea name="prompt" label="提示词" width="xl" rules={[{ required: true }]} />
          <div className={styles.modelAdvanced}>
            <Typography.Text strong>模型高级设置</Typography.Text>
            <ProFormGroup>
              <ProFormDigit name="temperature" label="Temperature" width="xs" min={0} max={2} step={0.1} />
              <ProFormDigit name="max_tokens" label="Max Tokens" width="xs" min={1} />
            </ProFormGroup>
          </div>
        </div>

        <div className={styles.section}>
          <Typography.Title level={5}>输入输出模块</Typography.Title>
          <ProFormGroup>
            <ProFormTextArea
              name={['file', 'outputPath']}
              label="输出目录绝对路径"
              fieldProps={{ autoSize: { minRows: 2, maxRows: 6 } }}
              width="lg"
              rules={[{ required: true, message: '输出目录为必填项' }]}
              extra="可手动输入完整路径，或点击按钮选择目录后自动回填。"
            />
            <ProFormTextArea
              name={['file', 'inputPath']}
              label="输入目录绝对路径"
              fieldProps={{ autoSize: { minRows: 2, maxRows: 6 } }}
              width="lg"
              extra="可手动输入完整路径，或点击按钮选择目录后自动回填。"
            />
          </ProFormGroup>
          <Space>
            <Button
              onClick={async () => {
                try {
                  const path = await pickDirectoryPath();
                  formRef.current?.setFieldValue(['file', 'outputPath'], path);
                } catch (error) {
                  messageApi.error((error as Error).message);
                }
              }}
            >
              选择输出目录
            </Button>
            <Button
              onClick={async () => {
                try {
                  const path = await pickDirectoryPath();
                  formRef.current?.setFieldValue(['file', 'inputPath'], path);
                } catch (error) {
                  messageApi.error((error as Error).message);
                }
              }}
            >
              选择输入目录
            </Button>
          </Space>
        </div>

        <div className={styles.section}>
          <Typography.Title level={5}>语言配置</Typography.Title>
          <ProFormGroup>
            <ProFormSelect
              name={['file', 'languageFileNameRule']}
              label="语言文件名规则"
              width="md"
              options={LANGUAGE_FILE_NAME_RULE_OPTIONS}
              rules={[{ required: true }]}
            />
            <ProFormSelect
              name={['file', 'sourceLanguage']}
              label="源语言"
              width="md"
              options={LanguageList}
              showSearch
              rules={[{ required: true }]}
            />
            <ProFormSelect
              name={['file', 'targetLanguage']}
              label="目标语言"
              width="md"
              options={LanguageList}
              showSearch
              rules={[{ required: true }]}
            />
          </ProFormGroup>
          <ProFormText name={['file', 'languageFileNameMapList']} hidden />
          <Typography.Paragraph style={{ marginTop: 8, marginBottom: 8 }}>
            默认以语言标记为输出的文件名，例：英文 en-US，可以修改文件名规则为 _ 或 en。如需自定义对应语言的文件名，可点击自定义按钮，手动添加映射。
          </Typography.Paragraph>
          <Button
            type="default"
            onClick={() => {
              const list =
                (formRef.current?.getFieldValue(['file', 'languageFileNameMapList']) as LanguageMapItem[] | undefined) ||
                [];
              mapForm.setFieldsValue({ languageFileNameMapList: list });
              setMapModalOpen(true);
            }}
          >
            自定义指定
          </Button>
        </div>
      </ProForm>

      <Modal
        title="语言标记导出文件名映射"
        open={mapModalOpen}
        onCancel={() => setMapModalOpen(false)}
        onOk={async () => {
          const values = await mapForm.validateFields();
          formRef.current?.setFieldValue(['file', 'languageFileNameMapList'], values.languageFileNameMapList || []);
          setMapModalOpen(false);
        }}
        width={840}
        destroyOnClose
      >
        <Form form={mapForm} layout="vertical">
          <Form.List name="languageFileNameMapList">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field) => (
                  <Space key={field.key} align="start" wrap>
                    <Form.Item
                      label="语言标记"
                      name={[field.name, 'languageTag']}
                      rules={[{ required: true, message: '请选择语言标记' }]}
                    >
                      <Select style={{ width: 260 }} options={LanguageList} showSearch />
                    </Form.Item>
                    <Form.Item
                      label="导出文件名（不含扩展名）"
                      name={[field.name, 'exportFileName']}
                      rules={[{ required: true, message: '请输入导出文件名' }]}
                    >
                      <Input style={{ width: 260 }} />
                    </Form.Item>
                    <Button danger onClick={() => remove(field.name)}>
                      删除
                    </Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ languageTag: '', exportFileName: '' })}>
                  新增映射
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
};

export default SettingPage;
