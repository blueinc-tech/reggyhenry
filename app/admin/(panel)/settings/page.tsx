import { requireUser } from "@/lib/auth";
import { mailProvider } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { storageStatus } from "@/lib/storage";
import { Flash } from "../Flash";
import { resetSettings, saveSettings } from "../settings-actions";

/** Site-wide settings that appear on the public pages and in emails. Administrators only. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
	await requireUser("admin");
	const sp = await searchParams;
	const s = await getSettings();
	const storage = storageStatus();

	return (
		<main className="adm-page">
			<header className="adm-head">
				<h1>Settings</h1>
			</header>
			<p className="adm-hint">Unchanged values are exactly what the WordPress site shows. Each section saves on its own.</p>
			<Flash ok={sp.ok} error={sp.error} />

			<section className="adm-box adm-stack" aria-labelledby="status-title">
				<h2 id="status-title">Email and file storage</h2>
				<p>
					Email: {mailProvider === "ses" ? "sent through Amazon SES." : mailProvider === "smtp" ? "sent through a mailbox (SMTP)." : "not set up. Messages and donations are still saved here, but nothing is emailed."}
				</p>
				<p>Uploads: {storage.store === "s3" ? `stored in the Amazon S3 bucket ${storage.bucket}.` : "stored on this computer (development only)."}</p>
			</section>

			<Section id="contact" title="Contact details" hint="In the header, the mobile menu and the footer.">
				<Field name="phone" label="Phone" value={s.contact.phone} />
				<Field name="email" label="Email" value={s.contact.email} type="email" />
				<Field name="addressLine1" label="Address, first line" value={s.contact.addressLine1} />
				<Field name="addressLine2" label="Address, second line" value={s.contact.addressLine2} />
			</Section>

			<Section id="social" title="Social links" hint="The icons in the header and the mobile menu. The live site still has the theme’s placeholder links (facebook.com, twitter.com); replace them with the foundation’s pages.">
				<Field name="facebook" label="Facebook" value={s.social.facebook} type="url" />
				<Field name="x" label="X (Twitter)" value={s.social.x} type="url" />
				<Field name="linkedin" label="LinkedIn" value={s.social.linkedin} type="url" />
				<Field name="instagram" label="Instagram" value={s.social.instagram} type="url" />
			</Section>

			<Section
				id="donations"
				title="Donation settings"
				hint="Donors pay by bank transfer. These instructions appear on every donation form, on the receipt page and in the email each donor receives. The text below is what the old site showed (a cheque by post); replace it with the foundation’s bank details."
			>
				<TextArea name="instructions" label="Payment instructions" value={s.donations.instructions} rows={8} hint="Blank lines start a new paragraph; lines starting 1. 2. 3. become a numbered list." />
				<Field name="bankName" label="Bank" value={s.donations.bankName} />
				<Field name="accountName" label="Account name" value={s.donations.accountName} />
				<Field name="accountNumber" label="Account number" value={s.donations.accountNumber} />
				<Field name="receiptSubject" label="Donor email: subject" value={s.donations.receiptSubject} />
				<TextArea name="receiptBody" label="Donor email: message" value={s.donations.receiptBody} rows={10} hint="{name}, {amount}, {campaign}, {reference} and {instructions} are filled in for each donor." />
			</Section>

			<Section id="forms" title="Form settings" hint="The Contact and Become a Volunteer forms, and where alerts go.">
				<Field name="notifyTo" label="Send alerts to" value={s.forms.notifyTo} type="email" hint="New messages, donation pledges and comments. Empty: info@rhagfnig.org.ng." />
				<Field name="contactConfirmation" label="Contact form: message after sending" value={s.forms.contactConfirmation} />
				<Field name="volunteerConfirmation" label="Volunteer form: message after sending" value={s.forms.volunteerConfirmation} />
				<label className="adm-check">
					<input type="checkbox" name="autoReplyEnabled" defaultChecked={s.forms.autoReply.enabled} /> Send an automatic reply to the person who wrote
				</label>
				<Field name="autoReplySubject" label="Automatic reply: subject" value={s.forms.autoReply.subject} />
				<TextArea name="autoReplyBody" label="Automatic reply: message" value={s.forms.autoReply.body} rows={6} hint="{name} is replaced with their first name." />
			</Section>

			<Section id="analytics" title="Analytics" hint="The Google tag from the old site (Site Kit). Loaded only on rhagfnig.org.ng, never on previews. Empty turns it off.">
				<Field name="googleTagId" label="Google tag id" value={s.analytics.googleTagId} />
			</Section>
		</main>
	);
}

function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
	return (
		<section className="adm-box adm-settings" id={id} aria-labelledby={`${id}-title`}>
			<h2 id={`${id}-title`}>{title}</h2>
			<p className="adm-hint">{hint}</p>
			<form action={saveSettings} className="adm-stack">
				<input type="hidden" name="section" value={id} />
				{children}
				<div className="adm-actions">
					<button className="btn" type="submit">
						Save {title.toLowerCase()}
					</button>
				</div>
			</form>
			<form action={resetSettings} className="adm-reset">
				<input type="hidden" name="section" value={id} />
				<button className="adm-link" type="submit">
					Put back the original {title.toLowerCase()}
				</button>
			</form>
		</section>
	);
}

function Field({ name, label, value, type = "text", hint }: { name: string; label: string; value: string; type?: string; hint?: string }) {
	const id = `f-${name}`;
	return (
		<div className="adm-field">
			<label htmlFor={id}>{label}</label>
			<input id={id} name={name} type={type} defaultValue={value} maxLength={500} />
			{hint && <p className="adm-hint">{hint}</p>}
		</div>
	);
}

function TextArea({ name, label, value, rows, hint }: { name: string; label: string; value: string; rows: number; hint?: string }) {
	const id = `f-${name}`;
	return (
		<div className="adm-field">
			<label htmlFor={id}>{label}</label>
			<textarea id={id} name={name} rows={rows} defaultValue={value} />
			{hint && <p className="adm-hint">{hint}</p>}
		</div>
	);
}
