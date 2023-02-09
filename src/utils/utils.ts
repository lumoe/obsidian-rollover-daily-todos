export const getContentBetweenHeadings = (
  heading1: string,
  heading2: string | undefined,
  lines: string
): string => {
  const ls = lines.split("\n");

  const begin = ls.indexOf(heading1);
  if (begin < 0) {
    return lines;
  }

  if (heading2 === undefined) {
    return ls
      .slice(begin + 1)
      .join("\n")
      .trim();
  }

  const end = ls.indexOf(heading2);

  if (end < 0) {
    return lines;
  }

  return ls
    .slice(begin + 1, end)
    .join("\n")
    .trim();
};
