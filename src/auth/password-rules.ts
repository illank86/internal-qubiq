import type { Rule } from "antd/es/form";

/** The website's rules for a new password, so both apps ask for the same thing. */
export const NEW_PASSWORD_RULES: Rule[] = [
  { required: true, message: "Enter a new password" },
  { min: 8, message: "At least 8 characters" },
  { max: 200, message: "That password is too long" },
  { pattern: /[a-z]/, message: "Add a lowercase letter" },
  { pattern: /[A-Z]/, message: "Add an uppercase letter" },
  { pattern: /[0-9]/, message: "Add a number" },
  { pattern: /[^A-Za-z0-9]/, message: "Add a symbol, such as ! or #" },
];

export const PASSWORD_HINT = "At least 8 characters, with a lowercase and an uppercase letter, a number and a symbol.";
