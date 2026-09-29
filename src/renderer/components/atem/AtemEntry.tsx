import { Plus, Tv } from "lucide-react";
import { useAtem } from "./atem-store";

export function AtemEntry({
  onOpen,
  banner = false,
}: {
  onOpen: () => void;
  banner?: boolean;
}) {
  const state = useAtem();
  const added = !!state.config.host;
  if (banner && added) return null;
  const button = (
    <button className="studio-button atem-entry-button" onClick={onOpen}>
      {added ? <Tv size={17} /> : <Plus size={17} />}
      {added ? "ATEM Mini" : "Adicionar ATEM Mini"}
    </button>
  );
  return banner ? (
    <aside className="atem-welcome">
      <Tv size={24} />
      <div>
        <strong>Conecte seu ATEM Mini</strong>
        <p>Veja qual câmera está no ar e prepare os nomes dos GCs.</p>
      </div>
      {button}
    </aside>
  ) : (
    button
  );
}
