import {
  HomeOutlined,
} from '@ant-design/icons';

export default {
  route: {
    path: '/',
    routes: [
      {
        path: '/home',
        name: '首页',
        icon: <HomeOutlined />
      }
    ],
  },
  location: {
    pathname: '/',
  }
};