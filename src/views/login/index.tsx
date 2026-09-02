import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Form, Input, Typography, message } from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import { login } from '../../api';
import { hasAuthSession, saveAuthSession } from '../../modules/auth/session';
import styles from './index.module.css';

type LoginFormValues = {
  account: string;
  password: string;
};

const LoginPage = () => {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  if (hasAuthSession()) return <Navigate to="/home" replace />;

  const submit = async (values: LoginFormValues): Promise<void> => {
    try {
      saveAuthSession(await login(values));
      navigate('/home', { replace: true });
    } catch (error) {
      const responseMessage = (error as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      messageApi.error(responseMessage || '账号或密码错误，请重试');
    }
  };

  return (
    <main className={styles.page}>
      {contextHolder}
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.brand}>Local Translate</div>
        <Typography.Title id="login-title" level={2} className={styles.title}>
          登录
        </Typography.Title>
        <Typography.Paragraph className={styles.subtitle}>
          使用管理后台账号继续
        </Typography.Paragraph>
        <Form<LoginFormValues> layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item name="account" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block>
            登录
          </Button>
        </Form>
      </section>
    </main>
  );
};

export default LoginPage;
