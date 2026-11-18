/*
 * RHAGF site behaviours, loaded after the theme's own scripts.
 *
 * 1. Starts the theme's Elementor widgets. The Oxpins add-on registers its widget
 *    code (carousels, counters, FAQ accordions, animations) with Elementor's front
 *    end, which this site doesn't load; this stands in for the small part it used.
 * 2. Sends the Contact and Volunteer forms (Contact Form 7 markup) to /api/forms/.
 * 3. Donation forms (GiveWP markup): amount buttons, the "Donate Now" pop-up, and
 *    sending the pledge to /api/donate/.
 * 4. The "Leave a Comment" form on campaign pages.
 */
(function ($) {
	"use strict";
	if (!$) return;

	/* ---------- 1. Elementor widgets ---------- */

	var actions = {};
	window.elementorFrontend = window.elementorFrontend || {
		hooks: {
			addAction: function (name, fn) {
				(actions[name] = actions[name] || []).push(fn);
			},
			doAction: function () {},
			addFilter: function () {},
			applyFilters: function (n, v) {
				return v;
			},
		},
		isEditMode: function () {
			return false;
		},
		config: { breakpoints: {} },
	};
	$(window).trigger("elementor/frontend/init");
	$(".elementor-widget[data-widget_type]").each(function () {
		var $scope = $(this);
		var type = $scope.attr("data-widget_type");
		[].concat(actions["frontend/element_ready/widget"] || [], actions["frontend/element_ready/" + type] || []).forEach(function (fn) {
			try {
				fn($scope, $);
			} catch (e) {
				if (window.console) console.warn("[rhagf] widget " + type, e);
			}
		});
	});
	// The theme waits for the window's load event; if it has already happened, run it again for them.
	if (document.readyState === "complete") $(window).trigger("load");

	/* ---------- 2. Contact and Volunteer forms ---------- */

	$(document).on("submit", "form[data-rhagf-form]", function (e) {
		e.preventDefault();
		var form = e.currentTarget;
		var $form = $(form);
		var $out = $form.find(".wpcf7-response-output");
		if ($form.hasClass("submitting")) return;
		$form.addClass("submitting").attr("data-status", "submitting");
		$form.find(".wpcf7-not-valid-tip").remove();
		$form.find(".wpcf7-not-valid").removeClass("wpcf7-not-valid").attr("aria-invalid", "false");
		$out.text("").attr("aria-hidden", "true");
		fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
			.then(function (r) {
				return r.json();
			})
			.catch(function () {
				return { status: "mail_failed", message: "There was an error trying to send your message. Please try again later." };
			})
			.then(function (res) {
				var status = res.status === "mail_sent" ? "sent" : res.status === "validation_failed" ? "invalid" : "failed";
				$form.removeClass("submitting init sent invalid failed").addClass(status).attr("data-status", status);
				(res.invalid_fields || []).forEach(function (f) {
					var $input = $form.find('[name="' + f.field + '"]');
					$input.addClass("wpcf7-not-valid").attr("aria-invalid", "true");
					$('<span class="wpcf7-not-valid-tip" aria-hidden="true"></span>').text(f.message).insertAfter($input);
				});
				$out.text(res.message || "").attr("aria-hidden", "false");
				if (status === "sent") form.reset();
			});
	});

	/* ---------- 3. Donation forms ---------- */

	var money = function (n) {
		return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	};
	var parse = function (s) {
		var n = Number(String(s).replace(/[^\d.]/g, ""));
		return isFinite(n) ? n : 0;
	};
	function setTotal($form) {
		var n = parse($form.find('input[name="amount"]').val());
		$form.find(".give-final-total-amount").html("&#8358; " + money(n));
	}
	$(document).on("click", ".rhagf-donate .give-donation-level-btn", function () {
		var $btn = $(this);
		var $form = $btn.closest("form");
		$form.find(".give-donation-level-btn").removeClass("give-default-level");
		$btn.addClass("give-default-level");
		var $amount = $form.find('input[name="amount"]');
		if ($btn.val() === "custom") {
			$amount.val("").trigger("focus");
		} else {
			$amount.val($btn.val());
		}
		setTotal($form);
	});
	$(document).on("input", '.rhagf-donate input[name="amount"]', function () {
		var $form = $(this).closest("form");
		$form.find(".give-donation-level-btn").removeClass("give-default-level");
		setTotal($form);
	});
	$(document).on("blur", '.rhagf-donate input[name="amount"]', function () {
		var n = parse(this.value);
		if (n) this.value = money(n);
	});
	$(document).on("click", ".give-btn-modal", function () {
		var target = $(this).attr("data-target");
		if ($.magnificPopup) {
			$.magnificPopup.open({ items: { src: target, type: "inline" }, mainClass: "give-modal rhagf-donate-modal", closeBtnInside: true });
		} else {
			$(target).removeClass("mfp-hide");
			$(this).hide();
		}
	});
	$(document).on("submit", "form.rhagf-donate", function (e) {
		e.preventDefault();
		var form = e.currentTarget;
		var $form = $(form);
		var $err = $form.find(".rhagf-donate-error");
		var show = function (msg) {
			$err.prop("hidden", false).find("p").text(msg);
		};
		$err.prop("hidden", true);
		var min = Number($form.attr("data-minimum") || 0);
		var amount = parse($form.find('input[name="amount"]').val());
		if (!amount) return show("Please enter a valid donation amount.");
		if (amount < min) return show("The minimum donation is ₦" + money(min) + ".");
		if (!$.trim($form.find('input[name="first_name"]').val())) return show("Please enter your first name.");
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($.trim($form.find('input[name="email"]').val()))) return show("Please enter a valid email address.");
		var $btn = $form.find(".give-submit");
		$btn.prop("disabled", true).val("Please wait…");
		$form.addClass("give-form-processing");
		fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
			.then(function (r) {
				return r.json();
			})
			.catch(function () {
				return { ok: false, message: "Your pledge couldn’t be sent. Please check your connection and try again." };
			})
			.then(function (res) {
				if (res.ok && res.redirect) {
					window.location.href = res.redirect;
					return;
				}
				$btn.prop("disabled", false).val("Donate Now");
				$form.removeClass("give-form-processing");
				show(res.message || "Please check the form and try again.");
			});
	});

	/* ---------- 4. Comments ---------- */

	$(document).on("submit", "form[data-rhagf-comment]", function (e) {
		e.preventDefault();
		var form = e.currentTarget;
		var $status = $(form).find(".rhagf-comment-status");
		var $btn = $(form).find("button[type=submit]").prop("disabled", true);
		fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
			.then(function (r) {
				return r.json();
			})
			.catch(function () {
				return { ok: false, message: "Your comment couldn’t be sent. Please try again." };
			})
			.then(function (res) {
				$btn.prop("disabled", false);
				$status.text(res.message || "").toggleClass("is-error", !res.ok);
				if (res.ok) form.reset();
			});
	});

	/* ---------- Messages after a form was sent without JavaScript ---------- */

	var q = new URLSearchParams(location.search);
	if (q.get("sent") || q.get("error")) {
		var $out = $(".wpcf7-response-output").first();
		$out.closest("form").addClass(q.get("sent") ? "sent" : "failed");
		$out.text(q.get("sent") ? "Thank you for your message. It has been sent." : q.get("error")).attr("aria-hidden", "false");
	}
})(window.jQuery);
