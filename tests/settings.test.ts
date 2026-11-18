import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, mergeSettings, naira, paymentText } from "../lib/site-settings.ts";

test("saved settings override defaults key by key and ignore unknown keys", () => {
	const s = mergeSettings([
		{ key: "contact", value: { phone: "+234 1 000 0000" } },
		{ key: "ads", value: { anything: true } },
	]);
	assert.equal(s.contact.phone, "+234 1 000 0000");
	assert.equal(s.contact.email, DEFAULT_SETTINGS.contact.email);
	assert.equal("ads" in s, false);
});

test("amounts print as GiveWP did", () => {
	assert.equal(naira(268000), "₦ 268,000.00");
	assert.equal(naira(1234.5), "₦ 1,234.50");
});

test("payment text adds the bank details only when they are filled in", () => {
	assert.equal(paymentText(DEFAULT_SETTINGS.donations), DEFAULT_SETTINGS.donations.instructions);
	const withBank = paymentText({ ...DEFAULT_SETTINGS.donations, instructions: "Pay by transfer.", bankName: "Zenith Bank", accountNumber: "0123456789" });
	assert.equal(withBank, "Pay by transfer.\n\nBank: Zenith Bank\nAccount number: 0123456789");
});
