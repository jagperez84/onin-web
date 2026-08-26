export function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">MÓDULO</div>
        <h1>{title}</h1>
        <p>Carcasa preparada para implementación funcional.</p>
      </div>
      <div>
        <span className="status-pill neutral">PENDIENTE</span>
      </div>
    </div>
  );
}
