import {
  HomeOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';

export default {
  route: {
    path: '/',
    routes: [
      {
        path: '/home',
        name: '首页',
        icon: <HomeOutlined />
      },
      {
        path: '/operation-record',
        name: '操作记录',
        icon: <HistoryOutlined />
      },
      {
        path: '/setting',
        name: '设置',
        icon: <SettingOutlined />
      }
    ],
  },
  location: {
    pathname: '/',
  }
};
