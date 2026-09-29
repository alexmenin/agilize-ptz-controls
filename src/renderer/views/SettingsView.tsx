export type Theme = "dark" | "light";

interface SettingsViewProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export const SettingsView = ({ theme, onThemeChange }: SettingsViewProps) => {
  return (
    <div className="settings-content">
      <div className="settings-section">
        <span className="ctrl-section-label">Appearance</span>
        <div className="theme-picker">
          <button
            type="button"
            className="theme-option"
            data-active={theme === "dark" || undefined}
            onClick={() => onThemeChange("dark")}
          >
            <span className="theme-swatch theme-swatch--dark" />
            Dark
          </button>
          <button
            type="button"
            className="theme-option"
            data-active={theme === "light" || undefined}
            onClick={() => onThemeChange("light")}
          >
            <span className="theme-swatch theme-swatch--light" />
            Light
          </button>
        </div>
      </div>
    </div>
  );
};
