import { describe, expect, it } from "vitest";

import indexHtml from "../index.html?raw";

describe("document title", () => {
  it("uses the Drop & Share brand and slogan", () => {
    expect(indexHtml).toContain(
      "<title>Drop &amp; Share - 一键部署，随时分享。</title>",
    );
  });
});
