import {
  SettingOutlined
} from '@ant-design/icons';
import { PageContainer, ProCard, ProLayout } from '@ant-design/pro-components';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import defaultProps from './_defaultProps.tsx';
// import logoImage from '../assets/logo.png';

const Layout = (props: { children: ReactElement}) => {
  const [pathname, setPathname] = useState('/list/sub-page/sub-sub-page1');
  const navigate = useNavigate();

  return (
    <div
      id="test-pro-layout"
      style={{
        height: '100vh',
      }}
    >
      <ProLayout
        title="Local Translate"
        logo="/logo.webp"
        siderWidth={216}
        bgLayoutImgList={[
          {
            src: 'https://img.alicdn.com/imgextra/i2/O1CN01O4etvp1DvpFLKfuWq_!!6000000000279-2-tps-609-606.png',
            left: 85,
            bottom: 100,
            height: '303px',
          },
          {
            src: 'https://img.alicdn.com/imgextra/i2/O1CN01O4etvp1DvpFLKfuWq_!!6000000000279-2-tps-609-606.png',
            bottom: -68,
            right: -45,
            height: '303px',
          },
          {
            src: 'https://img.alicdn.com/imgextra/i3/O1CN018NxReL1shX85Yz6Cx_!!6000000005798-2-tps-884-496.png',
            bottom: 0,
            left: 0,
            width: '331px',
          },
        ]}
        {...defaultProps}
        location={{
          pathname,
        }}
        
        avatarProps={{
          src: 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg',
          title: '',
          size: 'small',
        }}
        actionsRender={(props) => {
          if (props.isMobile) return [];
          return [
            <SettingOutlined onClick={() => navigate('/setting')} />
          ];
        }}
        menuItemRender={(item, dom) => (
          <div
            onClick={() => {
              console.log('item', item);
              navigate(item.path || '/');
            }}
          >
            {dom}
          </div>
        )}
      >
        <PageContainer>
          <ProCard
            style={{
              height: '100vh',
              minHeight: 800,
            }}
          >
            {props.children}
          </ProCard>
        </PageContainer>
      </ProLayout>
    </div>
  );
};

export default Layout