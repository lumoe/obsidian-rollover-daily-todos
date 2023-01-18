import { expect, test } from "vitest";
import { getContentBetweenHeadings } from "./utils";

test("getContentOfHeading only takes the content between the heading and the next heading at <= same header-level", () => {
  const originalText = `# Heading
 
Hello there! I'm a paragraph.
  
## TODO
  
Everything here shall be returned
  
### This heading shall also be returned

Another paragraph

## But this shall be excluded
  
Another paragraph that should be excluded
`;

  const heading1 = "## TODO";
  const heading2 = "## But this shall be excluded";

  let result = getContentBetweenHeadings(heading1, heading2, originalText);

  const expected1 = `Everything here shall be returned
  
### This heading shall also be returned

Another paragraph`;

  expect(result).toBe(expected1);

  const heading3 = "### This heading shall also be returned";
  const heading4 = "## But this shall be excluded";

  result = getContentBetweenHeadings(heading3, heading4, originalText);

  const expected2 = "Another paragraph";

  expect(result).toBe(expected2);
});
