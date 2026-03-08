import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  value?: string; // base64 data URL
  onChange?: (dataUrl: string | null) => void;
  disabled?: boolean;
  width?: number;
  height?: number;
  label?: string;
}

const SignaturePad = ({
  value,
  onChange,
  disabled = false,
  width = 400,
  height = 150,
  label = "Sign here",
}: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Draw existing value onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = value;
      setHasDrawn(true);
    } else {
      setHasDrawn(false);
    }
  }, [value]);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      if ("touches" in e) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (disabled) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      setIsDrawing(true);
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = "#1a1a2e";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    },
    [disabled, getPos]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || disabled) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    },
    [isDrawing, disabled, getPos]
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasDrawn(true);

    const canvas = canvasRef.current;
    if (canvas && onChange) {
      onChange(canvas.toDataURL("image/png"));
    }
  }, [isDrawing, onChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange?.(null);
  }, [onChange]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {!disabled && hasDrawn && (
          <Button type="button" variant="ghost" size="sm" onClick={clear} className="h-6 text-xs">
            <Eraser className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>
      <div
        className={`border rounded-md bg-white overflow-hidden ${
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-crosshair"
        }`}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none"
          style={{ height: `${height / 2}px` }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
    </div>
  );
};

export default SignaturePad;
