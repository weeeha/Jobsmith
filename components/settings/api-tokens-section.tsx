"use client";

import * as React from "react";
import { toast } from "sonner";

import { createTokenAction, revokeTokenAction } from "@/app/(app)/settings/actions";
import { useAnnounce } from "@/components/live-announcer";
import { LocalTime } from "@/components/local-time";
import { CopyButton } from "@/components/copy-button";
import { FieldRow } from "@/components/super-ai/field-row";
import { EmptyState } from "@/components/super-ai/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/pipeline/messages";
import { correctFocusOnceLost } from "@/lib/dom/focus";
import { submitViaTransition } from "@/lib/forms/submit";
import type { TokenFormState } from "@/lib/auth/api-token";
import type { ApiTokenListItem } from "@/lib/db/scoped";

export function ApiTokensSection({ tokens }: { tokens: ApiTokenListItem[] }) {
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">API tokens</h2>
        <p className="text-sm text-muted-foreground">
          Tokens let the jobsmith command line read your jobs and push documents to them.
        </p>
      </div>

      <div>
        <Button data-token-create="" onClick={() => setCreateOpen(true)}>
          Create token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <EmptyState size="panel" title="No tokens yet." />
      ) : (
        <ul aria-label="API tokens" className="flex flex-col gap-2">
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} />
          ))}
        </ul>
      )}

      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}

function TokenRow({ token }: { token: ApiTokenListItem }) {
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const revokeButtonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words font-medium text-foreground">{token.name}</span>
        <code className="break-all text-xs text-muted-foreground">{token.prefix}…</code>
        <p className="text-xs text-muted-foreground">
          Created <LocalTime value={token.createdAt} mode="date" />
        </p>
        <p className="text-xs text-muted-foreground">
          {token.lastUsedAt ? (
            <>
              Last used <LocalTime value={token.lastUsedAt} mode="date" />
            </>
          ) : (
            "Never used"
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {token.revokedAt ? (
          <p className="text-sm text-muted-foreground">
            Revoked <LocalTime value={token.revokedAt} mode="date" />
          </p>
        ) : (
          <Button
            ref={revokeButtonRef}
            variant="outline"
            size="sm"
            aria-label={`Revoke ${token.name}`}
            onClick={() => setRevokeOpen(true)}
          >
            Revoke
          </Button>
        )}
      </div>

      <RevokeTokenDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        token={{ id: token.id, name: token.name }}
      />
    </li>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Separate component inside DialogContent, same reasoning as
            add-job-dialog.tsx's AddJobForm: a fresh useActionState on every
            reopen instead of a stale error or a stale revealed token
            carried over from the previous open. */}
        <CreateTokenDialogBody onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function CreateTokenDialogBody({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [state, formAction, pending] = React.useActionState<TokenFormState, FormData>(createTokenAction, undefined);
  const announce = useAnnounce();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const tokenInputRef = React.useRef<HTMLInputElement>(null);
  const doneRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    // This effect only announces; it does not call onOpenChange(false),
    // because a successful create does not close the dialog - it swaps the
    // form for the reveal state below, still inside the same open
    // DialogContent.
    if (state?.ok) announce(`Created token ${state.data.name}.`);
  }, [state, announce]);

  React.useEffect(() => {
    // Entering the reveal state replaces the form (and the submit button
    // that was focused a moment ago) with this read-only field in the same
    // mounted DialogContent, so nothing in Base UI moves focus here on its
    // own - the dialog itself never closes and reopens, so its usual
    // open-focus behavior never fires a second time. Moving focus onto the
    // token field puts the very next Tab on Copy.
    if (state?.ok) tokenInputRef.current?.focus();
  }, [state]);

  React.useEffect(() => {
    // Same Chromium disabled-focus-loss fix as add-job-dialog.tsx's
    // AddJobForm: the submit button is genuinely disabled while pending,
    // which can move focus to <body>, and nothing brings it back on its
    // own once the rejected state renders.
    if (state?.ok === false) submitRef.current?.focus();
  }, [state]);

  if (state?.ok) {
    return (
      <>
        <DialogTitle>Copy your new token</DialogTitle>
        <p className="text-sm text-muted-foreground">
          This is the only time the token is shown. Save it with jobsmith login.
        </p>
        <div className="flex items-end gap-2">
          <FieldRow label="Your new token" className="flex-1">
            {(id) => (
              <Input
                id={id}
                ref={tokenInputRef}
                readOnly
                value={state.data.token}
                className="break-all font-mono"
              />
            )}
          </FieldRow>
          <CopyButton value={state.data.token} label="Copy the token" />
        </div>
        <DialogFooter>
          <Button ref={doneRef} onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form onSubmit={(event) => submitViaTransition(event, formAction)} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Create a token</DialogTitle>
      </DialogHeader>

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <FieldRow label="Name" hint={fieldErrors?.name}>
        {(id, describedBy) => (
          <Input
            id={id}
            name="name"
            aria-describedby={describedBy}
            aria-invalid={Boolean(fieldErrors?.name)}
          />
        )}
      </FieldRow>
      <p className="text-xs text-muted-foreground">
        A name that tells you where the token is used, like Laptop.
      </p>

      <DialogFooter>
        <Button ref={submitRef} type="submit" disabled={pending}>
          Create token
        </Button>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogFooter>
    </form>
  );
}

function RevokeTokenDialog({
  open,
  onOpenChange,
  token,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: { id: string; name: string };
}) {
  // Captures the pending flag (rather than discarding it) so the confirm
  // button below can disable itself for the duration of the request, the
  // same double-click guard every other confirm-and-call button in this
  // milestone uses.
  const [pending, startTransition] = React.useTransition();
  const announce = useAnnounce();

  function handleRevoke() {
    startTransition(async () => {
      try {
        const result = await revokeTokenAction(token.id);
        if (!result.ok) {
          toast.error(`Could not revoke ${token.name}. ${messageFor(result.code)}`);
          return;
        }
        onOpenChange(false);
        announce(`Revoked ${token.name}.`);
        // The dialog is still mid closing animation right here, holding
        // focus on its own "Revoke token" button - the same reasoning as
        // board.tsx's runClose/runMove: a one-time focusWasLost() check made
        // now would see focus as not lost yet and miss the loss that happens
        // once the animation actually finishes and this row's own "Revoke"
        // button has been replaced by plain "Revoked <date>" text.
        correctFocusOnceLost(() => {
          (document.querySelector("[data-token-create]") as HTMLElement | null)?.focus();
        });
      } catch (error) {
        console.error("revoke token failed", error);
        toast.error(`Could not revoke ${token.name}. ${messageFor("unexpected")}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke this token</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {token.name} stops working right away. This cannot be undone.
        </p>
        <DialogFooter>
          {/* In dark mode the destructive variant's own text-destructive over
              dark:bg-destructive/20 composites, on this dialog surface, to
              4.24:1 - short of the 4.5:1 minimum. A 10% tint measures about
              4.99:1 and the 15% hover tint about 4.62:1, so this button
              overrides just those two dark classes (tailwind-merge in cn()
              lets a later class win over the variant's own). */}
          <Button
            variant="destructive"
            disabled={pending}
            onClick={handleRevoke}
            className="dark:bg-destructive/10 dark:hover:bg-destructive/15"
          >
            Revoke token
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
