import Link from "next/link";

import { getDocument } from "@/lib/artifacts/read";
import { docsForTab, formatDocRef, selectDoc, type DocGroup, type DocRef } from "@/lib/artifacts/tabs";
import { DEFAULT_KIND_FOR_TAB, kindInfo } from "@/lib/artifacts/kinds";
import { DocumentList } from "@/components/job/document-list";
import { DocumentView } from "@/components/job/document-view";
import { DocumentEditor } from "@/components/job/document-editor";
import { MarkSentDialogTrigger } from "@/components/job/mark-sent-dialog";
import { VersionList } from "@/components/job/version-list";
import { PasteDialogTrigger } from "@/components/job/paste-dialog";
import { Markdown } from "@/components/markdown";
import { EmptyState } from "@/components/super-ai/empty-state";
import type { Scoped, ArtifactMeta } from "@/lib/db/scoped";

export async function TabDocuments(props: {
  s: Scoped;
  opportunityId: string;
  companyId: string;
  jobDocuments: ArtifactMeta[];
  docRef: DocRef | null;
  version: number | undefined;
  basePath: string;
  stages: { id: string; label: string }[];
}): Promise<React.ReactElement> {
  const docsList = docsForTab(props.jobDocuments, "documents");
  const groups: DocGroup[] = [{ id: "documents", heading: "", docs: docsList }];
  const selected = selectDoc(groups, props.docRef);

  const pasteTrigger = (
    <PasteDialogTrigger
      opportunityId={props.opportunityId}
      target={{ mode: "new" }}
      defaultKind={DEFAULT_KIND_FOR_TAB.documents}
      stages={props.stages}
      label="Paste markdown"
    />
  );

  if (selected === null) {
    return (
      <section aria-label="Documents" className="flex flex-col gap-4 py-4">
        <div>{pasteTrigger}</div>
        <EmptyState
          size="panel"
          title="No documents yet."
          description="Push a CV, cover letter or message from the command line, or paste markdown."
        />
      </section>
    );
  }

  const selectedRef: DocRef = { scope: "opportunity", key: selected.key };
  const doc = (await getDocument(
    props.s,
    { opportunityId: props.opportunityId, companyId: props.companyId },
    selectedRef,
    props.version,
  ))!;
  const isLatest = doc.current.version === doc.latestVersion;
  const stageLabel = props.stages.find((st) => st.id === doc.current.stageId)?.label ?? null;
  const sendable = kindInfo(doc.current.kind).sendable;

  return (
    <section aria-label="Documents" className="flex flex-col gap-4 py-4">
      <div>{pasteTrigger}</div>
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="md:w-64 md:shrink-0">
          <DocumentList
            label="Documents list"
            groups={groups}
            selected={selectedRef}
            basePath={props.basePath}
            tab="documents"
          />
        </div>
        {/* min-w-0: without it this flex sibling floors at its content's
            width, and a wide table or an unbroken long string inside the
            document view would push this column - and the whole page -
            wider than the viewport. */}
        <div className="flex min-w-0 flex-col gap-4 md:flex-1">
          {!isLatest ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="status" className="break-words text-sm text-muted-foreground">
                {doc.current.sentAt
                  ? "This version was sent and stays read-only."
                  : `You are viewing version ${doc.current.version}. The latest is version ${doc.latestVersion}.`}
              </p>
              <Link
                href={`${props.basePath}?tab=documents&doc=${formatDocRef({ scope: "opportunity", key: selected.key })}`}
                className="text-sm text-foreground underline underline-offset-4"
              >
                Open the latest version
              </Link>
            </div>
          ) : null}
          <DocumentView
            doc={doc.current}
            companyName={null}
            stageLabel={stageLabel}
            actions={
              <>
                {/* Keyed by the document, same reasoning as the editor
                    below: a history navigation that lands back on this tree
                    at the same position must not hand this dialog's open
                    state, or its uncontrolled fields, to a different
                    document. Each key below carries a prefix distinguishing
                    it from its sibling's: two sibling elements sharing one
                    key confuses React's reconciliation between renders
                    (observed directly - swapping documents left a stale,
                    orphaned trigger behind instead of removing it), even
                    though the siblings are different component types. */}
                <PasteDialogTrigger
                  key={`paste:${formatDocRef(selectedRef)}`}
                  opportunityId={props.opportunityId}
                  target={{ mode: "version", scope: "opportunity", key: selected.key }}
                  defaultKind={doc.current.kind}
                  stages={props.stages}
                  initial={{ title: doc.current.title, kind: doc.current.kind, stageId: doc.current.stageId }}
                  label="Paste a new version"
                  ariaLabel={`Paste a new version of ${doc.current.title}`}
                  variant="outline"
                />
                {sendable && !doc.current.sentAt ? (
                  <MarkSentDialogTrigger
                    key={`sent:${formatDocRef(selectedRef)}`}
                    opportunityId={props.opportunityId}
                    documentKey={selected.key}
                    version={doc.current.version}
                    title={doc.current.title}
                  />
                ) : null}
              </>
            }
          >
            {isLatest ? (
              <DocumentEditor
                // Keyed by the document, not the version: switching to
                // another document in the list is a search-param
                // navigation, so without this key React would keep reusing
                // the same editor instance and its in-progress draft state
                // across documents. The editor only ever renders for the
                // latest version, and a save closes it, so a version-based
                // key would remount on every save for no reason.
                key={formatDocRef({ scope: "opportunity", key: selected.key })}
                opportunityId={props.opportunityId}
                documentKey={selected.key}
                version={doc.current.version}
                bodyMd={doc.current.bodyMd}
                renderedBody={<Markdown source={doc.current.bodyMd} headingBase={3} />}
                isSent={Boolean(doc.current.sentAt)}
                title={doc.current.title}
              />
            ) : undefined}
          </DocumentView>
          <VersionList
            title={doc.current.title}
            documentKey={selected.key}
            basePath={props.basePath}
            versions={doc.versions}
          />
        </div>
      </div>
    </section>
  );
}
