import white from "../../assets/agilize-white.png";
import dark from "../../assets/agilize-dark.png";
export function Brand() {
  return (
    <span className="agilize-logo">
      <img className="logo-white" src={white} alt="Agilize Soluções Digitais" />
      <img className="logo-dark" src={dark} alt="Agilize Soluções Digitais" />
    </span>
  );
}
