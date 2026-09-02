import { useEffect, useState } from "react";
import { Alert, Descriptions, Skeleton } from "antd";
import { getUserInfo, type UserInfo } from "../../api/auth";

const getDisplayName = (user: UserInfo): string =>
  String(user.userName || "当前用户");

const formatDateTime = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const ProfilePage = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getUserInfo()
      .then((value) => {
        if (active) setUser(value);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "获取个人信息失败");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (!user) return <Skeleton active />;

  return (
    <div>
      <Descriptions bordered column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label="头像">
          {user.avatar ? <img src={user.avatar} alt="用户头像" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} /> : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="昵称">{getDisplayName(user)}</Descriptions.Item>
        <Descriptions.Item label="用户 ID">{user.id || "-"}</Descriptions.Item>
        <Descriptions.Item label="邮箱">{String(user.email || "-")}</Descriptions.Item>
        <Descriptions.Item label="手机号">{String(user.phoneNumber || "-")}</Descriptions.Item>
        <Descriptions.Item label="个人简介">{user.introduce || "-"}</Descriptions.Item>
        <Descriptions.Item label="角色">
          {user.roles?.length ? user.roles.map((role) => role.name || role.code).join("、") : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">{formatDateTime(user.createdAt)}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{formatDateTime(user.updatedAt)}</Descriptions.Item>
      </Descriptions>
    </div>
  );
};

export default ProfilePage;
