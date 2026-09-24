import { getDocument } from "@/lib/artifacts/read";
import { formatDocRef, researchGroups, scopeOf, selectDoc, type DocRef } from "@/lib/artifacts/tabs";
import { DEFAULT_KIND_FOR_TAB } from "@/lib/artifacts/kinds";
import { DocumentList } from "@/components/job/document-list";
import { DocumentView } from "@/components/job/document-view";
import { PasteDialogTrigger } from "@/components/job/paste-dialog";
import { EmptyState } from "@/components/super-ai/empty-state";
import type { Scoped, ArtifactMeta } from "@/lib/db/scoped";

export async function TabResearch(props: {
  s: Scoped;
  opportunityId: string;
  companyId: string;
  companyName: string;
  jobDocuments: ArtifactMeta[];
  docRef: DocRef | null;
  basePath: string;
  stages: { id: string; label: string }[];
}): Promise<React.ReactElement> {
  const companyDocuments = await props.s.artifact.listLatestForCompany(props.companyId);
  const groups = researchGroups(props.jobDocuments, companyDocuments, props.companyName);
  const selected = selectDoc(groups, props.docRef);

  const pasteTrigger = (
    <PasteDialogTrigger
      opportunityId={props.opportunityId}
      target={{ mode: "new" }}
      defaultKind={DEFAULT_KIND_FOR_TAB.research}
      stages={props.stages}
      label="Paste markdown"
    />
  );

  if (selected === null) {
    return (
      <section aria-label="Research" className="flex flex-col gap-4 py-4">
        <div>{pasteTrigger}</div>
        <EmptyState
          size="panel"
          title="No research yet."
          description="Push research from the command line or paste markdown."
        />
      </section>
    );
  }

  const scope = scopeOf(selected);
  const selectedRef: DocRef = { scope, key: selected.key };
  const doc = (await getDocument(
    props.s,
    { opportunityId: props.opportunityId, companyId: props.companyId },
    selectedRef,
  ))!;
  const stageLabel = props.stages.find((st) => st.id === doc.current.stageId)?.label ?? null;

  return (
    <section aria-label="Research" className="flex flex-col gap-4 py-4">
      <div>{pasteTrigger}</div>
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="md:w-64 md:shrink-0">
          <DocumentList
            label="Research documents"
            groups={groups}
            selected={selectedRef}
            basePath={props.basePath}
            tab="research"
          />
        </div>
        {/* min-w-0: without it this flex sibling floors at its content's
            width, and a wide table or an unbroken long string inside the
            document view would push this column - and the whole page -
            wider than the viewport. */}
        <div className="min-w-0 md:flex-1">
          <DocumentView
            doc={doc.current}
            companyName={scope === "company" ? props.companyName : null}
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
                target={{ mode: "version", scope, key: selected.key }}
                defaultKind={doc.current.kind}
                stages={props.stages}
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
