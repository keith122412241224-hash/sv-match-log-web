"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/Button";
import type { ComponentProps } from "react";

type SubmitButtonProps = ComponentProps<typeof Button> & {
  pendingLabel?: string;
};

export function SubmitButton({ children, pendingLabel = "処理中...", disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending || disabled} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
