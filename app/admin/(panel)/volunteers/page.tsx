import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { ImageField } from "@/components/admin/ImageField";
import { db } from "@/lib/db";
import { deleteTeamMember, moveTeamMember, saveTeamMember } from "../charity-actions";
import { Flash } from "../Flash";

type Row = { id: number; name: string; role: string; photo_media_id: number | null; url: string | null; links: { icon: string; url: string }[] };

const NETWORKS = [
	["facebook", "Facebook"],
	["x", "X (Twitter)"],
	["instagram", "Instagram"],
	["linkedin", "LinkedIn"],
	["pinterest", "Pinterest"],
] as const;

/** People shown on the Volunteers page. */
export default async function VolunteersAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
	const sp = await searchParams;
	const rows = await db()<Row[]>`select t.id, t.name, t.role, t.photo_media_id, t.links, m.url from team_members t left join media m on m.id = t.photo_media_id order by t.position, t.id`;
	return (
		<main className="adm-page">
			<header className="adm-head">
				<h1>Volunteers</h1>
				<a className="btn btn--ghost" href="/volunteers/" target="_blank" rel="noopener">
					View on site ↗
				</a>
			</header>
			<p className="adm-hint">
				The people on the Volunteers page, in this order. Applications from the “Become a Volunteer” form arrive under Messages. The eight people copied from the old site are the theme’s sample
				volunteers; replace them with your own.
			</p>
			<Flash ok={sp.ok} error={sp.error} />
			<details className="adm-box">
				<summary>Add a person</summary>
				<MemberForm />
			</details>
			<ul className="adm-cards">
				{rows.map((t, i) => (
					<li key={t.id} id={`t${t.id}`} className="adm-box adm-stack">
						<div className="adm-row">
							{/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
							{t.url && <img className="adm-thumb" src={t.url} alt="" />}
							<h2>{t.name}</h2>
							<span className="adm-hint">{t.role}</span>
						</div>
						<div className="adm-actions">
							<form action={moveTeamMember}>
								<input type="hidden" name="id" value={t.id} />
								<input type="hidden" name="dir" value="up" />
								<button className="adm-link" type="submit" disabled={i === 0}>
									↑ Earlier
								</button>
							</form>
							<form action={moveTeamMember}>
								<input type="hidden" name="id" value={t.id} />
								<input type="hidden" name="dir" value="down" />
								<button className="adm-link" type="submit" disabled={i === rows.length - 1}>
									↓ Later
								</button>
							</form>
						</div>
						<details className="adm-inline-edit">
							<summary>Edit</summary>
							<MemberForm member={t} />
							<form action={deleteTeamMember} className="adm-delete">
								<input type="hidden" name="id" value={t.id} />
								<ConfirmSubmit label={`Remove ${t.name}`} question={`Remove ${t.name} from the Volunteers page?`} confirmLabel="Yes, remove" />
							</form>
						</details>
					</li>
				))}
			</ul>
		</main>
	);
}

function MemberForm({ member }: { member?: Row }) {
	const p = member ? `t${member.id}` : "new";
	const link = (icon: string) => member?.links.find((l) => l.icon === icon)?.url ?? "";
	return (
		<form action={saveTeamMember} className="adm-stack">
			{member && <input type="hidden" name="id" value={member.id} />}
			<div className="adm-cols">
				<div className="adm-field">
					<label htmlFor={`${p}-name`}>Name</label>
					<input id={`${p}-name`} name="name" defaultValue={member?.name} required maxLength={100} />
				</div>
				<div className="adm-field">
					<label htmlFor={`${p}-role`}>Role</label>
					<input id={`${p}-role`} name="role" defaultValue={member?.role ?? "Volunteer"} maxLength={100} />
				</div>
			</div>
			<ImageField name="photo_media_id" label="Photo" initial={member?.photo_media_id && member.url ? { id: member.photo_media_id, url: member.url } : null} hint="Portrait photos fit best." />
			<fieldset className="adm-stack">
				<legend className="adm-label">Social links (optional)</legend>
				<div className="adm-cols">
					{NETWORKS.map(([icon, label]) => (
						<div className="adm-field" key={icon}>
							<label htmlFor={`${p}-${icon}`}>{label}</label>
							<input id={`${p}-${icon}`} name={`link_${icon}`} type="url" defaultValue={link(icon)} placeholder="https://…" maxLength={300} />
						</div>
					))}
				</div>
			</fieldset>
			<button className="btn" type="submit">
				{member ? "Save" : "Add"}
			</button>
		</form>
	);
}
