import { visit } from "unist-util-visit";
import { h } from "hastscript";

export const copyCode = () => {
  return (tree: any) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName == "pre" && node.children[0]?.tagName == "code") {
        node.children.push(
          h(
            "button",
            {
              class: "copy layer",
              type: "button",
              onclick: `navigator.clipboard.writeText(event.currentTarget.parentElement.firstElementChild.innerText)`,
            },
            "Copy",
          ),
        );
      }
    });
  };
};
