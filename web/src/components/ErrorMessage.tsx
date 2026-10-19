export function ErrorMessage({ message, onRetry, onDismiss }: {
  message: string; onRetry?: () => void; onDismiss?: () => void;
}) {
  return <div role="alert" className="error-message">
    <p>{message}</p>
    {onRetry && <button onClick={onRetry}>再試行</button>}
    {onDismiss && <button onClick={onDismiss}>閉じる</button>}
  </div>;
}
