import { mediaUrl, posterUrl } from "../../lib/cases";
import { withBasePath } from "../../lib/metadata";
import type { CaseItem } from "../../lib/types";
import { useEffect, useRef, useState } from "react";

interface CaseMediaPanelProps {
  readonly item: CaseItem;
}

export default function CaseMediaPanel({ item }: CaseMediaPanelProps) {
  const [mediaAvailable, setMediaAvailable] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const primary = item.media[0];
  const cover = posterUrl(primary) || "/poster-placeholder.svg";

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const markUnavailable = () => setMediaAvailable(false);
    video.addEventListener("error", markUnavailable);
    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) markUnavailable();
    return () => video.removeEventListener("error", markUnavailable);
  }, []);

  return (
    <section className="detail-media-panel" aria-label="案例媒体">
      {primary?.publicUrl && mediaAvailable ? (
        <video
          ref={videoRef}
          className="detail-video"
          poster={withBasePath(cover, import.meta.env.BASE_URL)}
          controls
          playsInline
          preload="metadata"
          onError={() => setMediaAvailable(false)}
        >
          <source src={mediaUrl(primary)} type="video/mp4" onError={() => setMediaAvailable(false)} />
        </video>
      ) : (
        <div className="detail-unavailable">
          <span>媒体暂不可用；案例文本与原帖来源仍可查阅</span>
        </div>
      )}
      <div className="media-ledger">
        <span>MEDIA / {item.media.length} ITEMS</span>
      </div>
      {item.media.slice(1).map((media) => (
        <div className="secondary-media" key={media.id}>
          <span>{media.type.toUpperCase()} / {media.status.toUpperCase()}</span>
          {media.publicUrl && <a href={mediaUrl(media)}>打开文件</a>}
        </div>
      ))}
    </section>
  );
}
