export function Spinner() {
  return (
    <div className="center-state">
      <div className="spinner" />
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="center-state">
      <p className="muted">Couldn't load this: {error.message}</p>
      {retry && <button className="btn" onClick={retry}>Try again</button>}
    </div>
  );
}
