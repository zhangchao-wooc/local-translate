import { SettingOutlined } from "@ant-design/icons";
import { PageContainer, ProCard, ProLayout } from "@ant-design/pro-components";
import { type ReactElement, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import defaultProps from "./_defaultProps.tsx";
// import logoImage from '../assets/logo.png';

type RouteItem = {
  path?: string;
  name?: string;
};

const resolveLayoutTitle = (pathname: string): string => {
  if (pathname === "/setting") {
    return "设置";
  }

  const routes = (defaultProps.route?.routes || []) as RouteItem[];
  const matched = routes.find((item) => item.path === pathname);

  return matched?.name || "Local Translate";
};

const Layout = (props: { children: ReactElement | null }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const currentTitle = useMemo(
    () => resolveLayoutTitle(location.pathname),
    [location.pathname],
  );

  return (
    <div
      id="test-pro-layout"
      style={{
        minHeight: "100vh",
        margin: 0,
      }}
    >
      <ProLayout
        title="Local Translate"
        logo="/logo.webp"
        siderWidth={216}
        bgLayoutImgList={[
          {
            src: "https://img.alicdn.com/imgextra/i2/O1CN01O4etvp1DvpFLKfuWq_!!6000000000279-2-tps-609-606.png",
            left: 85,
            bottom: 100,
            height: "303px",
          },
          {
            src: "https://img.alicdn.com/imgextra/i2/O1CN01O4etvp1DvpFLKfuWq_!!6000000000279-2-tps-609-606.png",
            bottom: -68,
            right: -45,
            height: "303px",
          },
          {
            src: "https://img.alicdn.com/imgextra/i3/O1CN018NxReL1shX85Yz6Cx_!!6000000005798-2-tps-884-496.png",
            bottom: 0,
            left: 0,
            width: "331px",
          },
        ]}
        {...defaultProps}
        location={{
          pathname: location.pathname,
        }}
        avatarProps={{
          src: "https://gw.alipayobjects.com/zos/antfincdn/efFD%24IOql2/weixintupian_20170331104822.jpg",
          title: "",
          size: "small",
        }}
        // actionsRender={(actionProps) => {
        //   if (actionProps.isMobile) return [];
        //   return [
        //     <SettingOutlined
        //       key="setting"
        //       onClick={() => navigate("/setting")}
        //     />,
        //   ];
        // }}
        menuItemRender={(item, dom) => (
          <div
            onClick={() => {
              navigate(item.path || "/");
            }}
          >
            {dom}
          </div>
        )}
      >
        <PageContainer>
          <ProCard
            style={{
              minHeight: "calc(100vh - 160px)",
              height: "auto",
            }}
          >
            {props.children}
          </ProCard>
        </PageContainer>
      </ProLayout>
    </div>
  );
};

export default Layout;
