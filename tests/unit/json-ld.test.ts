import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { jobPostingFromJsonLd } from "@/lib/intake/json-ld";

function docOf(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

describe("jobPostingFromJsonLd", () => {
  it("returns null when there is no ld+json script at all", () => {
    expect(jobPostingFromJsonLd(docOf("<html><body></body></html>"))).toBeNull();
  });

  it("finds a JobPosting nested inside an @graph array", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Northwind Traders" },
        { "@type": "JobPosting", title: "Product Designer", hiringOrganization: { "@type": "Organization", name: "Northwind Traders" } },
      ],
    })}</script></head><body></body></html>`;
    const result = jobPostingFromJsonLd(docOf(html));
    expect(result?.roleTitle).toBe("Product Designer");
    expect(result?.companyName).toBe("Northwind Traders");
  });

  it("matches a JobPosting whose @type is an array of types", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": ["Thing", "JobPosting"],
      title: "Array Type Role",
    })}</script></head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(html))?.roleTitle).toBe("Array Type Role");
  });

  it("reads hiringOrganization given as a plain string", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "R",
      hiringOrganization: "Acme Inc",
    })}</script></head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(html))?.companyName).toBe("Acme Inc");
  });

  it("joins multiple jobLocation places with a semicolon", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "R",
      jobLocation: [
        { "@type": "Place", address: { addressLocality: "Rotterdam", addressCountry: "NL" } },
        { "@type": "Place", address: { addressLocality: "Berlin", addressCountry: "DE" } },
      ],
    })}</script></head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(html))?.location).toBe("Rotterdam, NL; Berlin, DE");
  });

  it("maps jobLocationType TELECOMMUTE to workMode remote, and anything else to null", () => {
    const remoteHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "R",
      jobLocationType: "TELECOMMUTE",
    })}</script></head><body></body></html>`;
    const onsiteHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "R",
    })}</script></head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(remoteHtml))?.workMode).toBe("remote");
    expect(jobPostingFromJsonLd(docOf(onsiteHtml))?.workMode).toBeNull();
  });

  it("skips a script with invalid JSON and reads the next one instead", () => {
    const html = `<html><head>
<script type="application/ld+json">{not valid json</script>
<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Role Two" })}</script>
</head><body></body></html>`;
    expect(jobPostingFromJsonLd(docOf(html))?.roleTitle).toBe("Role Two");
  });
});
