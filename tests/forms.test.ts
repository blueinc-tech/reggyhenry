import assert from "node:assert/strict";
import { test } from "node:test";
import { FORMS, formatSubmission, parseAmount, pledgeReference, validateComment, validateForm, validatePledge } from "../lib/forms.ts";

// Field names are Contact Form 7's, as in the live site's markup.
const contact = { "your-name": "Ada Obi", email: "ada@example.com", Phone: "+234 806 000 0000", subject: "Volunteering", "textarea-421": "How can I help in Kukwaba?" };

test("contact form accepts a complete message and trims values", () => {
	const { values, errors } = validateForm(FORMS.contact, { ...contact, "your-name": "  Ada Obi  ", extra: "dropped" });
	assert.deepEqual(errors, {});
	assert.equal(values["your-name"], "Ada Obi");
	assert.equal("extra" in values, false);
});

test("contact form reports each missing or malformed field with Contact Form 7's wording", () => {
	const { errors } = validateForm(FORMS.contact, { "your-name": "", email: "not-an-email", Phone: "call me", subject: "", "textarea-421": "" });
	assert.deepEqual(Object.keys(errors).sort(), ["Phone", "email", "subject", "textarea-421", "your-name"]);
	assert.equal(errors["your-name"], "Please fill out this field.");
	assert.equal(errors.email, "Please enter an email address.");
});

test("single-line fields reject line breaks (no header injection)", () => {
	const { errors } = validateForm(FORMS.contact, { ...contact, "your-name": "Ada\nBcc: x@example.com" });
	assert.ok(errors["your-name"]);
});

test("volunteer form uses its own message field and formats as labelled text", () => {
	const v = { "your-name": "Ada Obi", email: "ada@example.com", Phone: "08060000000", address: "Mabushi, Abuja", date: "1990-01-01", occupation: "Teacher", message: "I can teach on weekends." };
	assert.deepEqual(validateForm(FORMS.volunteer, v).errors, {});
	assert.match(formatSubmission(FORMS.volunteer, v), /^Name\nAda Obi\n\nEmail\nada@example.com/);
});

test("amounts are read the way donors type them", () => {
	assert.equal(parseAmount("200,000.00"), 200000);
	assert.equal(parseAmount("₦ 5000"), 5000);
	assert.equal(parseAmount("NGN1,000"), 1000);
	assert.ok(Number.isNaN(parseAmount("five thousand")));
	assert.ok(Number.isNaN(parseAmount("1.234")));
});

test("pledges need an amount above the minimum, a first name and an email", () => {
	const ok = validatePledge({ amount: "50,000.00", first_name: "Ada", email: "ada@example.com", campaign_id: "2" }, 1000);
	assert.deepEqual(ok.value, { campaignId: 2, amount: 50000, firstName: "Ada", lastName: "", email: "ada@example.com", phone: "", message: "" });
	assert.match(validatePledge({ amount: "500", first_name: "Ada", email: "ada@example.com" }, 1000).error ?? "", /minimum donation is ₦1,000/);
	assert.ok(validatePledge({ amount: "5000", first_name: "", email: "ada@example.com" }, 1000).error);
	assert.ok(validatePledge({ amount: "5000", first_name: "Ada", email: "nope" }, 1000).error);
	assert.equal(validatePledge({ amount: "5000", first_name: "Ada", email: "ada@example.com", campaign_id: "x" }, 1000).value?.campaignId, null);
});

test("pledge references are short and unambiguous", () => {
	let i = 0;
	const seq = [0, 0.99, 0.5, 0.25, 0.1, 0.75];
	assert.equal(pledgeReference(() => seq[i++]), "RHAGF-A9SJD2");
	assert.match(pledgeReference(), /^RHAGF-[A-HJ-NP-Z2-9]{6}$/);
});

test("comments need a name, email and text; websites must be web addresses", () => {
	assert.ok(validateComment({ author: "Ada", email: "ada@example.com", comment: "Well done!" }).value);
	assert.ok(validateComment({ author: "", email: "ada@example.com", comment: "Hi" }).error);
	assert.ok(validateComment({ author: "Ada", email: "ada@example.com", comment: "Hi", url: "javascript:alert(1)" }).error);
});
