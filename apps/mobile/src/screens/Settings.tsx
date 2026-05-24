import { useRef, type ChangeEvent } from "react";
import { useBackgroundImage } from "../hooks/useBackgroundImage";

type Props = {
  onBack: () => void;
};

export function Settings({ onBack }: Props) {
  const { dataUrl, setFromFile, clear } = useBackgroundImage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      console.warn("[mobile] background must be an image");
      return;
    }
    try {
      await setFromFile(file);
    } catch (err) {
      console.warn("[mobile] failed to load background image", err);
    }
    event.target.value = "";
  };

  return (
    <div className="settings">
      <header className="settings__header">
        <button
          type="button"
          className="settings__back"
          onClick={onBack}
          aria-label="뒤로"
        >
          ‹
        </button>
        <div className="settings__title">설정</div>
      </header>
      <div className="settings__body">
        <section className="settings__section">
          <div className="settings__section-title">채팅 배경화면</div>
          <div className="settings__bg-preview">
            {dataUrl ? null : <span>배경 없음</span>}
          </div>
          <div className="settings__bg-actions">
            <button
              type="button"
              className="settings__bg-action"
              onClick={() => fileInputRef.current?.click()}
            >
              이미지 선택
            </button>
            {dataUrl ? (
              <button
                type="button"
                className="settings__bg-action settings__bg-action--danger"
                onClick={clear}
              >
                제거
              </button>
            ) : null}
          </div>
          <div className="settings__hint">
            기기에 저장된 이미지를 골라 채팅 화면 배경으로 사용합니다. 이미지는 기기
            안에만 저장되며 서버로 전송되지 않습니다.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </section>
      </div>
    </div>
  );
}
