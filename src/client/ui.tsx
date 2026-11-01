import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import QRCodeLib from 'qrcode';
import {
  AlertTriangle,
  Check,
  Copy,
  Moon,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn, copyText } from './utils';
import { gameStatusLabel } from './format';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('logo', compact && 'logo-compact')} aria-label="Vestiaire 7">
      <span className="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" focusable="false">
          <circle className="logo-ball" cx="24" cy="24" r="17" />
          <path className="logo-seam" d="M10 17c7 1 14 6 17 13M38 17c-7 1-14 6-17 13M24 7v7M24 34v7M7 24h7M34 24h7" />
        </svg>
      </span>
      {!compact && (
        <span className="logo-word">
          Vestiaire <b>7</b>
        </span>
      )}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn('btn', `btn-${variant}`, `btn-${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
}

export function IconButton({ label, size = 'md', className, children, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn('icon-btn', `icon-btn-${size}`, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'coach';

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === 'live' ? 'success' : status === 'paused' ? 'warning' : status === 'lobby' ? 'info' : 'neutral';
  return <Badge tone={tone}>{gameStatusLabel(status)}</Badge>;
}

export function TeamChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn('team-chip', className)} data-color={color}>
      <span className="team-chip-dot" aria-hidden="true" />
      {name}
    </span>
  );
}

export function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span className={cn('avatar', `avatar-${size}`)} data-color={color} aria-hidden="true">
      {letters || '?'}
    </span>
  );
}

export function Progress({
  value,
  max = 100,
  tone = 'primary',
  className,
}: {
  value: number;
  max?: number;
  tone?: 'primary' | 'success' | 'warning';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));
  return (
    <div
      className={cn('progress', `progress-${tone}`, className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{ '--value': `${pct}%` } as CSSProperties}
    >
      <span className="progress-fill" />
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('field', error && 'field-error')}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field-message field-message-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-message">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn('input', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn('textarea', className)} {...props} />;
});

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('select', className)} {...props}>
      {children}
    </select>
  );
}

export function CodeInput({
  value,
  onChange,
  length = 6,
  numeric = false,
  autoFocus = false,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  numeric?: boolean;
  autoFocus?: boolean;
  label: string;
}) {
  return (
    <input
      className={cn('code-input', numeric && 'code-input-numeric')}
      value={value}
      onChange={(event) => {
        const raw = event.target.value.toUpperCase().replace(numeric ? /\D/g : /[^A-Z0-9]/g, '');
        onChange(raw.slice(0, length));
      }}
      maxLength={length}
      inputMode={numeric ? 'numeric' : 'text'}
      autoCapitalize={numeric ? 'off' : 'characters'}
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={'•'.repeat(length)}
      style={{ '--code-length': length } as CSSProperties}
    />
  );
}

export function CopyButton({
  text,
  label = 'Copier',
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn('btn btn-ghost btn-sm', className)}
      onClick={async () => {
        const ok = await copyText(text);
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? 'Copié' : label}
    </button>
  );
}

export function QRCode({ value, size = 180 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const styles = getComputedStyle(document.documentElement);
    const dark = styles.getPropertyValue('--qr-dark').trim() || '#0b1220';
    const light = styles.getPropertyValue('--qr-light').trim() || '#ffffff';
    QRCodeLib.toDataURL(value, {
      margin: 1,
      width: size,
      color: { dark, light },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);
  return (
    <div className="qr" style={{ width: size, height: size }}>
      {src ? <img src={src} width={size} height={size} alt={`QR code : ${value}`} /> : <Spinner />}
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setThemeState] = useState<'dark' | 'light'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('v7:theme', next);
    } catch {
      // rien
    }
  };
  return (
    <IconButton label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'} onClick={toggle} className={className}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </IconButton>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number; icon?: LucideIcon }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === value}
            className={cn('tab', tab.id === value && 'is-active')}
            onClick={() => onChange(tab.id)}
          >
            {Icon ? <Icon size={15} /> : null}
            {tab.label}
            {tab.count != null ? <span className="tab-count">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className={cn('stat', tone && `stat-${tone}`)}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('divider', className)} />;
}

export function EmptyState({
  icon: Icon = AlertTriangle,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Spinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  return (
    <span className={cn('spinner', `spinner-${size}`)} role={label ? 'status' : undefined} aria-label={label}>
      <span className="spinner-ring" aria-hidden="true" />
    </span>
  );
}

export function ConnectionDot({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span className={cn('conn-dot', connected ? 'is-online' : 'is-offline')}>
      <span className="conn-dot-mark" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const push = useCallback(
    (type: ToastItem['type'], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-3), { id, type, message }]);
      window.setTimeout(() => dismiss(id), 4800);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={cn('toast', `toast-${toast.type}`)}>
          <span className="toast-icon" aria-hidden="true">
            {toast.type === 'success' ? <Check size={16} /> : toast.type === 'error' ? <AlertTriangle size={16} /> : <span className="toast-info-dot" />}
          </span>
          <span className="toast-message">{toast.message}</span>
          <IconButton label="Fermer" size="sm" onClick={() => onDismiss(toast.id)}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={cn('modal', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Fermer" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function LoadingScreen({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="loading-screen">
      <Logo />
      <Spinner label={label} />
      <p>{label}</p>
    </div>
  );
}

export function ErrorScreen({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="error-screen">
      <Logo />
      <div className="error-card">
        <span className="error-icon">
          <AlertTriangle size={24} />
        </span>
        <h1>{title}</h1>
        <p>{message}</p>
        {action ? <div className="error-action">{action}</div> : null}
      </div>
    </div>
  );
}
