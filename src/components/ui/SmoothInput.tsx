"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import React, {
  type ComponentPropsWithoutRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "../../lib/utils";

type SmoothInputType = React.HTMLInputTypeAttribute;

type SmoothInputProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  wrapperClassName?: string;
  type?: SmoothInputType;
};


const PASSWORD_CHAR = navigator.userAgent.match(/firefox|fxios/i)
  ? "\u25CF"
  : "\u2022";

const SmoothInput = React.forwardRef<HTMLInputElement, SmoothInputProps>(({
  className,
  wrapperClassName,
  value,
  defaultValue,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  style,
  ...props
}, forwardedRef) => {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const caretX = useMotionValue(0);
  const caretOpacity = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const isControlled = value !== undefined;

  const springCaretX = useSpring(
    caretX,
    prefersReducedMotion
      ? { stiffness: 10000, damping: 100, mass: 0.1 }
      : { stiffness: 500, damping: 30, mass: 0.5 },
  );

  const inputValue = isControlled ? String(value) : internalValue;
  const activeType = type as SmoothInputType;
  const displayPlaceholder = placeholder ?? "";

  const isEmail = activeType === "email";
  const resolvedType = isEmail ? "text" : activeType;
  const resolvedInputMode = props.inputMode ?? (isEmail ? "email" : undefined);
  const resolvedAutoCapitalize =
    props.autoCapitalize ?? (isEmail ? "none" : undefined);
  const resolvedAutoCorrect =
    props.autoCorrect ?? (isEmail ? "off" : undefined);
  const resolvedSpellCheck = props.spellCheck ?? (isEmail ? false : undefined);
  const resolvedAutoComplete =
    props.autoComplete ?? (isEmail ? "email" : undefined);

  const syncMeasureSpan = () => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return;

    const styles = window.getComputedStyle(input);
    const isPassword = input.type === "password";

    let fontSize = styles.fontSize;
    if (
      PASSWORD_CHAR === "\u2022" &&
      isPassword &&
      !navigator.userAgent.match(/chrome|chromium|crios/i)
    ) {
      fontSize = `${parseFloat(fontSize) + 6.25}px`;
    }

    measureSpan.style.fontFamily = styles.fontFamily;
    measureSpan.style.fontSize = fontSize;
    measureSpan.style.fontWeight = styles.fontWeight;
    measureSpan.style.fontStyle = styles.fontStyle;
    measureSpan.style.letterSpacing = styles.letterSpacing;
    measureSpan.style.fontFeatureSettings = styles.fontFeatureSettings;
    measureSpan.style.fontVariationSettings = styles.fontVariationSettings;
  };

  const measurePrefixWidth = (text: string) => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return null;

    syncMeasureSpan();
    measureSpan.textContent = text;

    const paddingLeft =
      parseFloat(window.getComputedStyle(input).paddingLeft) || 0;

    return text.length > 0
      ? measureSpan.offsetWidth + paddingLeft
      : paddingLeft - 1;
  };

  const scrollCaretIntoView = (
    target: HTMLInputElement,
    absoluteWidth: number,
  ) => {
    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
    const visibleRight = target.scrollLeft + target.clientWidth - paddingRight;
    const visibleLeft = target.scrollLeft + paddingLeft;

    if (absoluteWidth > visibleRight) {
      target.scrollLeft = Math.min(
        absoluteWidth - target.clientWidth + paddingRight,
        maxScroll,
      );
      return;
    }

    if (absoluteWidth < visibleLeft) {
      target.scrollLeft = Math.max(0, absoluteWidth - paddingLeft);
    }
  };

  const getCaretIndex = (target: HTMLInputElement) => {
    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    try {
      selectionStart = target.selectionStart;
      selectionEnd = target.selectionEnd;
    } catch {
      return target.value.length;
    }

    if (selectionStart === null || selectionEnd === null) {
      return target.value.length;
    }

    if (selectionStart === selectionEnd) {
      return selectionStart;
    }

    return target.selectionDirection === "backward"
      ? selectionStart
      : selectionEnd;
  };

  const updateCaretFromInput = useCallback((target: HTMLInputElement) => {
    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    try {
      selectionStart = target.selectionStart;
      selectionEnd = target.selectionEnd;
    } catch {
      // Selection unsupported on this input type
    }

    const hasSelection =
      selectionStart !== null &&
      selectionEnd !== null &&
      selectionStart !== selectionEnd;

    const caretIndex = getCaretIndex(target);
    const isPassword = target.type === "password";
    const textBeforeCaret = isPassword
      ? PASSWORD_CHAR.repeat(caretIndex)
      : target.value.slice(0, caretIndex);

    const absoluteWidth = measurePrefixWidth(textBeforeCaret);
    if (absoluteWidth === null) return;

    scrollCaretIntoView(target, absoluteWidth);

    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const caretPosition = absoluteWidth - target.scrollLeft;
    const minX = paddingLeft - 1;
    const maxX = target.clientWidth - paddingRight;
    const isCaretVisible =
      caretPosition >= minX && caretPosition <= maxX + 1;

    caretX.set(Math.max(minX, Math.min(caretPosition, maxX)));

    if (!isCaretVisible || hasSelection) {
      caretOpacity.set(0);
      return;
    }

    caretOpacity.set(1);
  }, [caretX, caretOpacity]);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      updateCaretFromInput(input);
    }
  }, [inputValue, updateCaretFromInput]);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      updateCaretFromInput(input);
    }
  }, [activeType, updateCaretFromInput]);

  useEffect(() => {
    const input = inputRef.current;
    const container = containerRef.current;
    if (!input || !container) return;

    const updateCaretIfFocused = () => {
      if (document.activeElement === input) {
        updateCaretFromInput(input);
      }
    };

    const handleSelectionChange = () => {
      if (document.activeElement !== input) return;

      requestAnimationFrame(() => {
        if (document.activeElement === input) {
          updateCaretFromInput(input);
        }
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.fonts.addEventListener("loadingdone", updateCaretIfFocused);
    void document.fonts.ready.then(updateCaretIfFocused);
    input.addEventListener("scroll", updateCaretIfFocused);

    const resizeObserver = new ResizeObserver(updateCaretIfFocused);
    resizeObserver.observe(container);

    updateCaretIfFocused();

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.fonts.removeEventListener("loadingdone", updateCaretIfFocused);
      input.removeEventListener("scroll", updateCaretIfFocused);
      resizeObserver.disconnect();
    };
  }, [updateCaretFromInput]);

  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <div
        ref={containerRef}
        className="relative grid grid-cols-1 p-0 h-full items-center"
        style={{ caretColor: "transparent" }}
      >
        <input
          {...props}
          ref={(node) => {
            inputRef.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
          }}
          type={resolvedType}
          inputMode={resolvedInputMode}
          autoCapitalize={resolvedAutoCapitalize}
          autoCorrect={resolvedAutoCorrect}
          spellCheck={resolvedSpellCheck}
          autoComplete={resolvedAutoComplete}
          placeholder={displayPlaceholder}
          className={cn(
            "w-full bg-transparent outline-none placeholder:text-foreground/40",
            "col-start-1 col-end-2 row-start-1 row-end-2 text-inherit",
            className,
          )}
          style={style}
          value={inputValue}
          onChange={(e) => {
            if (!isControlled) setInternalValue(e.target.value);
            onChange?.(e);
            requestAnimationFrame(() => {
              updateCaretFromInput(e.target);
            });
          }}
          onSelect={(e) => {
            updateCaretFromInput(e.currentTarget);
            props.onSelect?.(e);
          }}
          onClick={(e) => {
            updateCaretFromInput(e.currentTarget);
            props.onClick?.(e);
          }}
          onKeyUp={(e) => {
            updateCaretFromInput(e.currentTarget);
            props.onKeyUp?.(e);
          }}
          onKeyDown={(e) => {
            requestAnimationFrame(() => {
              if (inputRef.current) {
                updateCaretFromInput(inputRef.current);
              }
            });
            props.onKeyDown?.(e);
          }}
          onFocus={(e) => {
            updateCaretFromInput(e.target);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            caretOpacity.set(0);
            onBlur?.(e);
          }}
        />
        <span
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 whitespace-pre"
        />
        <motion.div
          className="bg-orange-500 pointer-events-none col-start-1 col-end-2 row-start-1 row-end-2 h-[1em] w-[2px] self-center justify-self-start"
          style={{ x: springCaretX, opacity: caretOpacity }}
        />
      </div>
    </div>
  );
});

export { SmoothInput };
