import { Sender } from '@ant-design/x';
import './InputBar.less';

/** InputBar Props */
export interface InputBarProps {
  /** 输入框当前值。 */
  value: string;
  /** 输入框值变更。 */
  onChange: (next: string) => void;
  /** 提交回调，与父级 ChatPage 的 onRequest 同路径。 */
  onSubmit: (value: string) => void;
  /** 是否处于发送中（绑定到 Sender 的 loading）。 */
  loading?: boolean;
}

/** 吸底输入栏：包装 AntD X 的 Sender，叠加上方分隔线 + 下方 helper hint。 */
export function InputBar({ value, onChange, onSubmit, loading }: InputBarProps) {
  return (
    <div className="travel-inputbar">
      <div className="travel-inputbar__inner">
        <Sender
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          loading={loading}
          placeholder="想去哪里？告诉我城市、时段或一种心情…"
        />
        <div className="travel-inputbar__hint">
          按 ENTER 发送 · SHIFT + ENTER 换行 · 天气数据来自公开气象 API
        </div>
      </div>
    </div>
  );
}
