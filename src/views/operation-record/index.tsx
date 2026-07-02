import { useMemo, useState } from "react";
import { Button, Modal, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useLocalStorageState } from "ahooks";
import type { OperationRecord } from "../../modules/operation-history/types";
import styles from "./index.module.css";

type DetailState = {
  title: string;
  content: string;
} | null;

const prettyJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

const renderChangeContent = (record: OperationRecord): string => {
  if (record.affectedFileNames?.length || record.sourceEntries) {
    const sourceEntries = record.sourceEntries || {};
    const sourceEntryKeys = Object.keys(sourceEntries);
    const lines: string[] = [];
    lines.push(`影响文件(${record.affectedFileNames?.length || 0})`);
    (record.affectedFileNames || []).forEach((fileName) => {
      lines.push(`- ${fileName}`);
    });
    lines.push(`原词条(${sourceEntryKeys.length})`);
    sourceEntryKeys.forEach((key) => {
      lines.push(`- ${key}: ${JSON.stringify(sourceEntries[key])}`);
    });

    if (record.translatedEntries) {
      lines.push("翻译结果 JSON:");
      lines.push(prettyJson(record.translatedEntries).trimEnd());
    }

    return lines.join("\n");
  }

  const lines: string[] = [];
  lines.push(`文件名: ${record.fileChange.fileName}`);
  lines.push(`新建文件: ${record.fileChange.created ? "是" : "否"}`);
  lines.push(`更新(${record.fileChange.updated.length})`);
  record.fileChange.updated.forEach((item) => {
    lines.push(
      `- ${item.key}: ${JSON.stringify(item.before)} -> ${JSON.stringify(item.after)}`,
    );
  });
  lines.push(`新增(${record.fileChange.added.length})`);
  record.fileChange.added.forEach((item) => {
    lines.push(`- ${item.key}: ${JSON.stringify(item.after)}`);
  });
  lines.push(`删除(${record.fileChange.deleted.length})`);
  record.fileChange.deleted.forEach((item) => {
    lines.push(`- ${item.key}: ${JSON.stringify(item.before)}`);
  });
  return lines.join("\n");
};

const OperationRecordPage = () => {
  const [history] = useLocalStorageState<OperationRecord[]>(
    "operation-history",
    {
      defaultValue: [],
    },
  );
  const [detail, setDetail] = useState<DetailState>(null);

  const dataSource = useMemo(() => {
    return [...(history || [])].sort(
      (a, b) =>
        new Date(b.operatedAt).getTime() - new Date(a.operatedAt).getTime(),
    );
  }, [history]);

  const columns: ColumnsType<OperationRecord> = [
    {
      title: "操作时间",
      dataIndex: "operatedAt",
      key: "operatedAt",
      width: 200,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "文件",
      key: "file",
      render: (_, record) => (
        <Space wrap>
          {(record.affectedFileNames || [record.fileChange.fileName]).map(
            (fileName) => (
              <Tag key={fileName} color="blue">
                {fileName}
              </Tag>
            ),
          )}
          {record.fileChange.created ? (
            <Tag color="green">新建</Tag>
          ) : (
            <Tag>更新</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "输出目录",
      dataIndex: "outputDirectoryName",
      key: "outputDirectoryName",
      width: 180,
      render: (value: string) => value || "-",
    },
    {
      title: "操作配置",
      key: "config",
      width: 120,
      render: (_, record) => (
        <Button
          type="link"
          onClick={() =>
            setDetail({
              title: "操作配置详情",
              content: prettyJson(record.operationConfig),
            })
          }
        >
          查看
        </Button>
      ),
    },
    {
      title: "文件变化",
      key: "change",
      width: 120,
      render: (_, record) => (
        <Button
          type="link"
          onClick={() =>
            setDetail({
              title: "文件变化详情",
              content: renderChangeContent(record),
            })
          }
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      {!dataSource.length ? (
        <Typography.Text className={styles.empty}>暂无操作记录</Typography.Text>
      ) : (
        <Table
          rowKey="id"
          dataSource={dataSource}
          columns={columns}
          pagination={{ pageSize: 10 }}
        />
      )}

      <Modal
        open={Boolean(detail)}
        title={detail?.title || ""}
        footer={null}
        onCancel={() => setDetail(null)}
        width={760}
      >
        <pre className={styles.pre}>{detail?.content || ""}</pre>
      </Modal>
    </div>
  );
};

export default OperationRecordPage;
