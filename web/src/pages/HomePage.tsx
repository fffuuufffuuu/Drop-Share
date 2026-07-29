import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="home-page">
      <div className="home-hero">
        <p className="home-eyebrow">DROP &amp; SHARE</p>
        <h2>把网页变成一个随时可分享的链接</h2>
        <p className="home-summary">
          上传单个 HTML 文件或完整网页文件夹，几秒钟内获得可以直接打开和分享的访问链接。
        </p>
        <div className="home-actions">
          <Link className="home-primary-action" to="/upload">
            免费使用
          </Link>
          <Link className="home-secondary-action" to="/login">
            登录/注册
          </Link>
        </div>
        <div className="home-link-preview" aria-label="示例访问链接">
          <span>已发布</span>
          <code>drop.yaoguosir.com/p/your-page</code>
        </div>
        <p className="home-retention">
          匿名上传默认保留 3 小时；登录后可选择 1–24 小时，并查看自己的上传记录。
        </p>
      </div>

      <div className="home-features" aria-label="主要功能">
        <article>
          <span>文件</span>
          <h3>上传网页</h3>
          <p>支持单个 HTML 文件，也支持包含样式、图片和脚本的完整文件夹。</p>
        </article>
        <article>
          <span>链接</span>
          <h3>立即分享</h3>
          <p>上传完成后立即获得访问链接，无需自行配置服务器。</p>
        </article>
        <article>
          <span>账号</span>
          <h3>注册后管理</h3>
          <p>查看个人上传记录，并用独立空间整理需要集中管理的网页。</p>
        </article>
      </div>
    </section>
  );
}
