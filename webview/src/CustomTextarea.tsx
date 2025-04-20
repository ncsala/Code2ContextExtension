import React, { useRef, useEffect } from "react";

interface CustomTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  className?: string;
}

const CustomTextarea: React.FC<CustomTextareaProps> = ({
  value,
  onChange,
  placeholder,
  rows = 4,
  id,
  className,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Manejar el evento de cambio directamente
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Manejar teclas especiales como Tab
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();

      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Insertar dos espacios para Tab
      const newValue = value.substring(0, start) + "  " + value.substring(end);

      // Establecer nuevo valor y posición del cursor
      onChange(newValue);

      // Necesitamos usar setTimeout para que React actualice el DOM
      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  // Nos aseguramos que el cursor siempre esté correctamente posicionado
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Guardar la posición del cursor antes del render
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      // Restaurar la posición después del render
      setTimeout(() => {
        if (document.activeElement === textarea) {
          textarea.selectionStart = selectionStart;
          textarea.selectionEnd = selectionEnd;
        }
      }, 0);
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      id={id}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={rows}
      className={className}
      spellCheck={false}
      style={{
        fontFamily: '"Consolas", "Courier New", monospace',
        whiteSpace: "pre",
        overflowWrap: "normal",
        overflowX: "auto",
        lineHeight: "1.5",
        tabSize: 2,
      }}
    />
  );
};

export default CustomTextarea;
