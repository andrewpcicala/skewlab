const LINKEDIN = "https://www.linkedin.com/in/andrewcicala/";
const GITHUB   = "https://github.com/andrewpcicala/skewlab";

export default function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--color-edge)" }}>
      <div
        className="max-w-[1200px] mx-auto px-6"
        style={{ paddingTop: "16px", paddingBottom: "32px" }}
      >
        <span className="label-caps">
          SKEWLAB — OPTIONS ANALYTICS WITH HAND-WRITTEN PRICING · BUILT BY ANDREW CICALA
          {" · "}
          <a href={LINKEDIN} target="_blank" rel="noreferrer" className="link-accent">
            LINKEDIN
          </a>
          {" "}
          <a href={GITHUB} target="_blank" rel="noreferrer" className="link-accent">
            GITHUB
          </a>
        </span>
      </div>
    </footer>
  );
}
