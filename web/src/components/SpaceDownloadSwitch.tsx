export function SpaceDownloadSwitch({
  enabled, onToggle,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return <div className="space-download-panel">
    <div className="space-download-setting">
      <span>允许访客下载空间内的作品</span>
      <button type="button" role="switch" className="space-download-switch"
        aria-label="允许访客下载空间内的作品" aria-checked={enabled}
        onClick={() => onToggle(!enabled)}>
        <span className="space-download-switch-thumb" />
      </button>
    </div>
  </div>;
}
