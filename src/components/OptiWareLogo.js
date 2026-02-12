import { Box } from "lucide-react";

const sizes = {
  sm: { icon: 20, text: "text-lg" },
  md: { icon: 26, text: "text-xl" },
  lg: { icon: 34, text: "text-2xl" },
  xl: { icon: 44, text: "text-4xl" },
};

const OptiWareLogo = ({ size = "md", showText = true, className = "" }) => {
  const s = sizes[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative">
        <div className="gradient-primary rounded-lg p-1.5 flex items-center justify-center">
          <Box size={s.icon} className="text-primary-foreground" strokeWidth={2.2} />
        </div>
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-success animate-pulse-soft" />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`font-bold tracking-tight ${s.text}`}>
            Opti<span className="text-gradient">Ware</span>
          </span>
          {size !== "sm" && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mt-0.5">
              Warehouse Intelligence
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default OptiWareLogo;
