import { getDocument } from "@/lib/artifacts/read";
import { formatDocRef, prepGroups, selectDoc, type DocRef } from "@/lib/artifacts/tabs";
import { DocumentList } from "@/components/job/document-list";
import { DocumentView } from "@/components/job/document-view";
import { PasteDialogTrigger } from "@/components/job/paste-dialog";
import { BridgePanel } from "@/components/job/bridge-panel";
import { EmptyState } from "@/components/super-ai/empty-state";
import type { Scoped, ArtifactMeta, StageRow } from "@/lib/db/scoped";

export async function TabPrep(props: {
  s: Scoped;
  opportunityId: string;
  companyId: string;
  jobDocuments: ArtifactMeta[];
  docRef: DocRef | null;
  basePath: string;
  stages: StageRow[]; // position-sorted; prepGroups sorts its own copy again regardless
  slug: string;
}): Promise<React.ReactElement> {
  const groups = prepGroups(props.jobDocuments, props.stages);
  const selected = selectDoc(groups, props.docRef);
  const stageOptions = props.stages.map((stage) => ({ id: stage.id, label: stage.label }));

  const bridgePanel = <BridgePanel slug={props.slug} opportunityId={props.opportunityId} stages={stageOptions} />;

  if (selected === null) {
    return (
      <section aria-label="Prep" className="flex flex-col gap-4 py-4">
        {bridgePanel}
        <EmptyState
          size="panel"
          title="No prep documents yet."
          description="Push a prep packet from the command line or paste markdown."
        />
      </section>
    );
  }

  const selectedRef: DocRef = { scope: "opportunity", key: selected.key };
  const doc = (await getDocument(
    props.s,
    { opportunityId: props.opportunityId, companyId: props.companyId },
    selectedRef,
  ))!;
  const stageLabel = stageOptions.find((st) => st.id === doc.current.stageId)?.label ?? null;

  return (
    <section aria-label="Prep" className="flex flex-col gap-4 py-4">
      {bridgePanel}
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="md:w-64 md:shrink-0">
          <DocumentList
            label="Prep documents"
            groups={groups}
            selected={selectedRef}
            basePath={props.basePath}
            tab="prep"
          />
        </div>
        <div className="min-w-0 md:flex-1">
          <DocumentView
            doc={doc.current}
            companyName={null}
            stageLabel={stageLabel}
            actions={
              // Keyed by the document, same reasoning as the editor's own
              // key on the Documents tab: a history navigation that lands
              // back on this tree at the same position must not hand this
              // dialog's open state, or its uncontrolled fields, to a
              // different document.
              <PasteDialogTrigger
                key={formatDocRef(selectedRef)}
                opportunityId={props.opportunityId}
                target={{ mode: "version", scope: "opportunity", key: selected.key }}
                defaultKind={doc.current.kind}
                stages={stageOptions}
                initial={{ title: doc.current.title, kind: doc.current.kind, stageId: doc.current.stageId }}
                label="Paste a new version"
                ariaLabel={`Paste a new version of ${doc.current.title}`}
                variant="outline"
              />
            }
          />
        </div>
      </div>
    </section>
  );
}
