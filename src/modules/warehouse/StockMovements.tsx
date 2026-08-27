import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { StockMovementCreateModal } from "./StockMovementCreateModal";
import { StockMovementsList } from "./StockMovementsList";
import "./stock.css";

export function StockMovements() {
  const location = useLocation();
  const navigate = useNavigate();
  const [successMessage, setSuccessMessage] = useState("");
  const isCreateOpen = location.pathname.endsWith("/nuevo");

  useEffect(() => {
    const message = (location.state as { stockSuccess?: string } | null)?.stockSuccess;
    if (!message) return;
    setSuccessMessage(message);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  return (
    <div className="stock-page">
      <StockMovementsList successMessage={successMessage} />
      {isCreateOpen && <StockMovementCreateModal onClose={() => navigate("/almacen/movimientos")} />}
    </div>
  );
}
