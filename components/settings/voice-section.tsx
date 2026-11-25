"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteAllAudioAction, loadVoicesAction, savePrepSettingsAction } from "@/app/(app)/settings/actions";
import { useAnnounce } from "@/components/live-announcer";
import { NativeSelect } from "@/components/native-select";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormState } from "@/lib/forms/state";
import { messageFor } from "@/lib/pipeline/messages";
import { PREP_COPY } from "@/lib/prep/copy";
import { DEFAULT_PREP_SETTINGS, resolveVoices, type PrepSettings } from "@/lib/prep/settings";
import { providerLabel, storageLine } from "@/lib/prep/voices";
import type { Voice } from "@/lib/tts/driver";

type DeviceVoice = { name: string; voiceURI: string; lang: string };
type VoiceLoad = { phase: "loading" | "failed" | "loaded"; list: Voice[] };

async function saveSafely(prev: FormState, formData: FormData): Promise<FormState> {
  try {
    return await savePrepSettingsAction(prev, formData);
  } catch (error) {
    console.error("save voice settings failed", error);
    return { ok: false, code: "unexpected", message: messageFor("unexpected") };
  }
}

// The device's own speech voices. Chrome fills the list late and says so with
// voiceschanged; Safari and Firefox may have it at once. A browser without
// speechSynthesis reads as `supported` false with an empty list.
type DeviceVoices = { voices: DeviceVoice[]; supported: boolean };
const SERVER_VOICES: DeviceVoices = { voices: [], supported: true };
let cachedKey = "";
let cachedVoices: DeviceVoices = SERVER_VOICES;

// useSyncExternalStore needs the same object back while nothing changed.
function deviceVoicesSnapshot(): DeviceVoices {
  const synth = window.speechSynthesis;
  const voices = synth ? synth.getVoices().map((v) => ({ name: v.name, voiceURI: v.voiceURI, lang: v.lang })) : [];
  const key = `${synth ? "1" : "0"}|${voices.map((v) => `${v.voiceURI}:${v.name}:${v.lang}`).join("|")}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedVoices = { voices, supported: Boolean(synth) };
  }
  return cachedVoices;
}

function subscribeDeviceVoices(onChange: () => void): () => void {
  const synth = window.speechSynthesis;
  synth?.addEventListener?.("voiceschanged", onChange);
  return () => synth?.removeEventListener?.("voiceschanged", onChange);
}

function useDeviceVoices(): DeviceVoices {
  return React.useSyncExternalStore(subscribeDeviceVoices, deviceVoicesSnapshot, () => SERVER_VOICES);
}

export function VoiceSection(props: {
  provider: string | null;
  settings: PrepSettings;
  storage: { clips: number; bytes: number };
}): React.ReactElement {
  const copy = PREP_COPY.voice;
  const { provider, settings } = props;
  const announce = useAnnounce();
  const baseId = React.useId();
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(saveSafely, undefined);
  const [load, setLoad] = React.useState<VoiceLoad>({ phase: provider ? "loading" : "loaded", list: [] });
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const device = useDeviceVoices();
  const [browser, setBrowser] = React.useState({
    interviewer: settings.browserVoices.interviewer ?? "",
    candidate: settings.browserVoices.candidate ?? "",
  });
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;
  const generalError = state?.ok === false && !fieldErrors ? state.message : undefined;

  const fetchVoices = React.useCallback(async () => {
    try {
      const result = await loadVoicesAction();
      setLoad(result.ok ? { phase: "loaded", list: result.data } : { phase: "failed", list: [] });
    } catch (error) {
      console.error("load voices failed", error);
      setLoad({ phase: "failed", list: [] });
    }
  }, []);

  const started = React.useRef(false);
  React.useEffect(() => {
    if (!provider || started.current) return;
    started.current = true;
    void fetchVoices();
  }, [provider, fetchVoices]);

  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) {
      toast.success(copy.saved);
      announce(copy.saved);
    } else {
      announce(fieldErrors ? copy.checkFields : state.message);
    }
  }, [state, fieldErrors, announce, copy.saved, copy.checkFields]);

  const listed = load.phase === "loaded" && load.list.length > 0;
  const resolved = resolveVoices(settings, listed ? load.list : []);
  const ids = {
    interviewer: `${baseId}-interviewer`,
    mine: `${baseId}-mine`,
    browserInterviewer: `${baseId}-bi`,
    browserMine: `${baseId}-bm`,
    speed: `${baseId}-speed`,
    pause: `${baseId}-pause`,
  };

  async function deleteAll() {
    setDeleting(true);
    try {
      const result = await deleteAllAudioAction();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setConfirmOpen(false);
      announce(copy.deletedAll(result.data.deleted));
      toast.success(copy.deletedAll(result.data.deleted));
    } catch (error) {
      console.error("delete all audio failed", error);
      toast.error(`${copy.deleteAllFailed} ${messageFor("unexpected")}`);
    } finally {
      setDeleting(false);
    }
  }

  const providerField = (id: string, name: string, value: string) =>
    listed ? (
      <NativeSelect key={`${name}-select`} id={id} name={name} defaultValue={value} className="w-full">
        {(load.list.some((v) => v.id === value) ? load.list : [{ id: value, label: value, language: null }, ...load.list]).map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </NativeSelect>
    ) : (
      <Input key={`${name}-text`} id={id} name={name} defaultValue={value} autoComplete="off" />
    );

  const deviceOptions = (current: string) => {
    const known = device.voices.some((v) => v.voiceURI === current);
    return (
      <>
        <option value="">{copy.deviceDefault}</option>
        {current !== "" && !known ? <option value={current}>{current}</option> : null}
        {device.voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.lang ? `${v.name} (${v.lang})` : v.name}
          </option>
        ))}
      </>
    );
  };

  return (
    <SettingsSection title={copy.title} intro={copy.intro}>
      <form onSubmit={(event) => submitViaTransition(event, formAction)} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">{copy.providerHeading}</h3>
          <p className="text-sm text-muted-foreground">{provider ? providerLabel(provider) : copy.off}</p>
        </div>

        {provider ? (
          <div className="flex flex-col gap-4">
            {load.phase === "loading" ? (
              <p role="status" className="text-sm text-muted-foreground">
                {copy.loadingVoices}
              </p>
            ) : null}
            {load.phase === "failed" ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
                <span className="break-words">{copy.loadFailed}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLoad({ phase: "loading", list: [] });
                    void fetchVoices();
                  }}
                >
                  {copy.loadAgain}
                </Button>
              </div>
            ) : null}
            {load.phase === "loaded" && load.list.length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy.emptyList}</p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.interviewer}>{copy.interviewer}</Label>
              {providerField(ids.interviewer, "interviewerVoice", resolved.interviewer)}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.mine}>{copy.mine}</Label>
              {providerField(ids.mine, "candidateVoice", resolved.candidate)}
            </div>
            {fieldErrors?.voices ? <p className="break-words text-xs text-destructive">{fieldErrors.voices}</p> : null}
          </div>
        ) : (
          <>
            {/* Without a provider the saved voices stay as they are. */}
            <input type="hidden" name="interviewerVoice" value={settings.voices.interviewer ?? ""} />
            <input type="hidden" name="candidateVoice" value={settings.voices.candidate ?? ""} />
          </>
        )}

        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{copy.browserHint}</p>
          {!device.supported ? <p className="text-sm text-muted-foreground">{copy.noBrowserVoices}</p> : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.browserInterviewer}>{copy.browserInterviewer}</Label>
            <NativeSelect
              id={ids.browserInterviewer}
              name="browserInterviewer"
              className="w-full"
              value={browser.interviewer}
              disabled={!device.supported}
              onChange={(e) => setBrowser((b) => ({ ...b, interviewer: e.target.value }))}
            >
              {deviceOptions(browser.interviewer)}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.browserMine}>{copy.browserMine}</Label>
            <NativeSelect
              id={ids.browserMine}
              name="browserCandidate"
              className="w-full"
              value={browser.candidate}
              disabled={!device.supported}
              onChange={(e) => setBrowser((b) => ({ ...b, candidate: e.target.value }))}
            >
              {deviceOptions(browser.candidate)}
            </NativeSelect>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.speed}>{copy.speed}</Label>
            <Input
              id={ids.speed}
              name="speed"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.8"
              max="1.5"
              defaultValue={String(settings.speed)}
              aria-invalid={Boolean(fieldErrors?.speed)}
              aria-describedby={`${ids.speed}-hint`}
            />
            {fieldErrors?.speed ? <p className="break-words text-xs text-destructive">{fieldErrors.speed}</p> : null}
            <p id={`${ids.speed}-hint`} className="text-xs text-muted-foreground">
              {copy.speedHint}
            </p>
            <p className="text-xs text-muted-foreground">{copy.defaultNote(DEFAULT_PREP_SETTINGS.speed)}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.pause}>{copy.pauseFactor}</Label>
            <Input
              id={ids.pause}
              name="gapFactor"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.5"
              max="2"
              defaultValue={String(settings.gapFactor)}
              aria-invalid={Boolean(fieldErrors?.gapFactor)}
              aria-describedby={`${ids.pause}-hint`}
            />
            {fieldErrors?.gapFactor ? <p className="break-words text-xs text-destructive">{fieldErrors.gapFactor}</p> : null}
            <p id={`${ids.pause}-hint`} className="text-xs text-muted-foreground">
              {copy.pauseHint}
            </p>
            <p className="text-xs text-muted-foreground">{copy.defaultNote(DEFAULT_PREP_SETTINGS.gapFactor)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {copy.save}
          </Button>
          {fieldErrors ? (
            <p role="alert" className="text-sm text-destructive">
              {copy.checkFields}
            </p>
          ) : generalError ? (
            <p role="alert" className="text-sm text-destructive">
              {generalError}
            </p>
          ) : null}
        </div>
      </form>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-medium text-foreground">{copy.storage}</h3>
            <p className="text-sm text-muted-foreground">{storageLine(props.storage.clips, props.storage.bytes)}</p>
          </div>
          <Button type="button" variant="outline" disabled={props.storage.clips === 0} onClick={() => setConfirmOpen(true)}>
            {copy.deleteAll}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{copy.keepClips}</p>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.deleteAllTitle}</DialogTitle>
            <DialogDescription>{copy.deleteAllBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="destructive" disabled={deleting} onClick={deleteAll}>
              {copy.deleteAllConfirm}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {copy.deleteAllKeep}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
