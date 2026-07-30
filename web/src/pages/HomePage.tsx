import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="home-page">
      <div className="home-hero">
        <div className="home-copy">
          <p className="home-eyebrow">DROP &amp; SHARE</p>
          <h1>
            <span className="home-title-line">一键部署，</span>
            <span className="home-title-line">随时分享。</span>
          </h1>
          <p className="home-summary">
            上传 HTML 文件或完整网页文件夹，立即获得一个可分享的访问链接。
          </p>
          <div className="home-actions">
            <Link className="home-primary-action" to="/upload">免费使用</Link>
            <Link className="home-secondary-action" to="/login">登录/注册</Link>
          </div>
          <p className="home-retention">
            匿名上传默认保留 3 小时；登录后可选择 1–24 小时，并查看自己的上传记录。
          </p>
        </div>
        <aside className="deploy-card" aria-label="网页发布示例">
          <p className="deploy-card-label">正在发布</p>
          <div className="deploy-card-file">
            <code>portfolio/index.html</code>
            <span>部署完成</span>
          </div>
          <div className="deploy-card-flow" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="deploy-card-result">
            <small>访问链接</small>
            <code>drop.yaoguosir.com/p/your-page</code>
          </div>
        </aside>
      </div>

      <div className="home-features" aria-label="主要功能">
        <article>
          <h3 className="home-feature-title">一键部署</h3>
          <p>支持单个 HTML 文件，也支持包含样式、图片和脚本的完整文件夹。</p>
        </article>
        <article>
          <h3 className="home-feature-title">立即分享</h3>
          <p>上传完成后立即获得访问链接，无需自行配置服务器。</p>
        </article>
        <article>
          <h3 className="home-feature-title">统一管理</h3>
          <p>查看个人上传记录，并用独立空间整理需要集中管理的网页。</p>
        </article>
      </div>
    </section>
  );
}
