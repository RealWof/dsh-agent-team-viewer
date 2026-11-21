/* ------------------------------------------------------------------ *
 * Shared surface: the board stylesheet, three primitives, and the number
 * formatters. Everything here is local to the bundle — nothing is imported,
 * so a fragment may use these freely.
 * ------------------------------------------------------------------ */

    /** The whole stylesheet, rendered once by the tab body. */
    const CSS = `
.tk-root{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;min-width:0;height:100%;
  color:var(--dsw-alias-label-primary);font-size:12px;line-height:17px;box-sizing:border-box}
.tk-scroll{display:flex;flex-direction:column;gap:10px;flex:1 1 auto;min-height:0;overflow:auto;padding:10px 12px 16px}
.tk-head{display:flex;align-items:center;gap:7px;min-width:0}
.tk-head-title{margin:0;min-width:0;font-size:13px;line-height:18px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-head-sub{min-width:0;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.tk-head-spacer{flex:1 1 auto;min-width:4px}
.tk-sort{position:relative;flex:none;max-width:132px;min-width:0}
.tk-sort-btn{display:inline-flex;align-items:center;gap:3px;max-width:132px;min-width:0;padding:1px 3px;
  border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;line-height:14px;cursor:pointer}
.tk-sort-btn:hover{color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent))}
.tk-sort-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-sort-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-sort-chevron{flex:none;transition:transform .12s ease}
.tk-sort-btn[aria-expanded="true"] .tk-sort-chevron{transform:rotate(180deg)}
@media (prefers-reduced-motion: reduce){.tk-sort-chevron{transition:none}}
.tk-sort-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:6;min-width:132px;padding:3px;
  border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);
  background:var(--dsw-alias-bg-layer-2);box-shadow:0 6px 18px rgba(0,0,0,.28)}
.tk-sort-option{display:flex;align-items:center;gap:5px;width:100%;min-width:0;padding:3px 6px;border:0;
  border-radius:3px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;
  line-height:15px;text-align:left;white-space:nowrap;cursor:pointer}
.tk-sort-option:hover,.tk-sort-option:focus-visible,.tk-sort-option[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover,
  color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent));outline:none}
.tk-sort-option[aria-checked="true"]{background:var(--dsw-alias-interactive-bg-hover,
  color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent))}
.tk-sort-check{flex:none;visibility:hidden;color:var(--dsw-alias-brand-primary)}
.tk-sort-option[aria-checked="true"] .tk-sort-check{visibility:visible}
.tk-readonly{display:inline-flex;align-items:center;gap:3px;flex:none;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:999px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}
.tk-group-toggle{display:inline-flex;align-items:center;gap:3px;flex:none;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;
  font-size:10px;line-height:14px;white-space:nowrap;cursor:pointer}
.tk-group-toggle:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.tk-group-toggle[data-on="true"]{color:var(--dsw-alias-brand-primary);
  border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.tk-group-toggle:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-group-toggle[data-on="false"]{opacity:.8}
.tk-icon-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;padding:0;
  border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.tk-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent));
  color:var(--dsw-alias-label-primary)}
.tk-icon-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;min-width:0;align-items:start}
.tk-board[data-cols="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.tk-board[data-cols="1"]{grid-template-columns:minmax(0,1fr)}
.tk-col{display:flex;flex-direction:column;gap:5px;min-width:0}
.tk-col-head{display:flex;align-items:center;gap:3px;min-width:0;padding:0 1px}
.tk-col-head>.tk-state{margin-top:0;flex:none}
.tk-col-title{margin:0;min-width:0;font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.2px;
  color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.tk-col-count{flex:none;padding:0 5px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;
  font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:10px;line-height:14px;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-secondary)}
.tk-col-body{display:flex;flex-direction:column;gap:5px;min-width:0;min-height:24px}
.tk-col-items{display:flex;flex-direction:column;gap:5px;min-width:0;max-height:min(340px,52vh);
  overflow-y:auto;overscroll-behavior:contain;padding-right:2px}
.tk-col-empty{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));
  padding:5px 6px;border:1px dashed var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm)}
.tk-chevron{flex:none;transition:transform .12s ease}
[aria-expanded="false"] > .tk-chevron{transform:rotate(-90deg)}
@media (prefers-reduced-motion: reduce){.tk-chevron{transition:none}}
.tk-fold{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;padding:0;
  border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.tk-fold:hover{color:var(--dsw-alias-label-primary)}
.tk-fold:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-col-fold{width:100%;box-sizing:border-box;padding:1px 2px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;
  color:inherit;font:inherit;text-align:left;cursor:pointer}
.tk-col-fold:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent))}
.tk-col-fold:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-col [data-subgroup="true"]{padding-left:3px}
.tk-col [data-subgroup="true"] .tk-col-title{font-size:9px;letter-spacing:.1px;text-transform:none}
.tk-col [data-subgroup="true"] .tk-col-count{padding:0 4px;font-size:9px}
.tk-more{display:flex;align-items:center;justify-content:center;gap:4px;width:100%;min-width:0;padding:2px 6px;
  border:1px dashed var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;line-height:14px;cursor:pointer}
.tk-more:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent));
  color:var(--dsw-alias-label-primary)}
.tk-more:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-more-count{flex:none;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-variant-numeric:tabular-nums}
.tk-card{display:flex;flex-direction:column;gap:3px;min-width:0;width:100%;text-align:left;box-sizing:border-box;
  padding:6px 7px;border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-border-l3);
  border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:inherit;
  font:inherit;cursor:pointer;transition:background .12s ease,border-color .12s ease}
.tk-card:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent))}
.tk-card:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-card[data-state="warning"]{border-left-color:var(--dsw-alias-state-warn-primary)}
.tk-card[data-state="done"]{border-left-color:var(--dsw-alias-state-success-primary)}
.tk-card[data-state="ongoing"]{border-left-color:var(--dsw-alias-label-tertiary)}
.tk-card[data-blocked="true"] .tk-card-id{color:var(--dsw-alias-state-warn-primary)}
.tk-card-title{min-width:0;font-size:11px;line-height:15px;font-weight:600;overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.tk-card[data-status="completed"] .tk-card-title{color:var(--dsw-alias-label-secondary)}
.tk-card-head{display:flex;align-items:flex-start;gap:5px;min-width:0}
.tk-state{position:relative;display:inline-grid;place-items:center;flex:none;width:10px;height:10px;margin-top:3px}
.tk-state:after{content:'';position:absolute;inset:20%;border-radius:50%;background:currentColor}
.tk-state[data-state="idle"]{color:var(--dsw-alias-state-idle-primary)}
.tk-state[data-state="ongoing"]{color:var(--dsw-alias-label-tertiary)}
.tk-state[data-state="done"]{color:var(--dsw-alias-state-success-primary)}
.tk-state[data-state="warning"]{color:var(--dsw-alias-state-warn-primary)}
.tk-state[data-state="error"]{color:var(--dsw-alias-state-error-primary)}
.tk-spin{animation:tk-spin 1.1s linear infinite;transform-origin:50% 50%}
@keyframes tk-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.tk-spin{animation:none}}
.tk-card-meta{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
.tk-card-id{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:9px;line-height:13px;
  color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.tk-card-owner{display:inline-flex;align-items:center;gap:3px;vertical-align:middle;min-width:0;font-size:10px;
  line-height:14px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-card-owner>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-chip{display:inline-flex;align-items:center;gap:3px;flex:none;padding:0 5px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:999px;font-size:9px;line-height:14px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.tk-chip[data-tone="ok"]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent)}
.tk-chip[data-tone="info"]{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent)}
.tk-chip[data-tone="error"]{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)}
.tk-chip[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent)}
.tk-stats{display:flex;align-items:center;gap:3px;flex-wrap:wrap;min-width:0;margin-top:1px}
.tk-stat{display:inline-flex;align-items:center;gap:3px;flex:none;font-size:9px;line-height:13px;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.tk-stat[data-live="true"]{color:var(--dsw-alias-brand-primary)}
.tk-agents{display:flex;flex-direction:column;gap:4px;min-width:0}
.tk-agents-head,.tk-section-head{display:flex;align-items:center;gap:5px;min-width:0}
.tk-totals-label{font-size:9px;line-height:13px;text-transform:uppercase;letter-spacing:.4px;color:var(--dsw-alias-label-secondary)}
.tk-divider{border-top:1px solid var(--dsw-alias-border-l1);margin:1px 0 0}
.tk-totals{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0}
.tk-agent-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;min-width:0;align-items:start}
.tk-agent-board[data-cols="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.tk-agent-board[data-cols="1"]{grid-template-columns:minmax(0,1fr)}
.tk-agent-row{display:flex;flex-direction:column;gap:1px;min-width:0;padding:3px 5px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);
  transition:background .12s ease,border-color .12s ease}
.tk-agent-row:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent))}
.tk-agent-row:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-agent-row[data-activity="inactive"]{opacity:.86}
.tk-agent-row[data-lead="true"]{background:transparent;border-style:dashed}
.tk-agent-row[data-activity="running"]{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,var(--dsw-alias-border-l1))}
.tk-agent-row[data-hover="true"]{border-color:var(--dsw-alias-brand-primary);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent)}
.tk-agent-main{display:flex;align-items:center;gap:4px;min-width:0}
.tk-agent-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;padding-left:13px}
.tk-agent-jobs{flex:none;margin-left:auto;min-width:24px;justify-content:center;cursor:default;font-variant-numeric:tabular-nums}
.tk-agent-jobs[data-live="true"]{color:var(--dsw-alias-brand-primary);
  border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent)}
.tk-agent-name{min-width:0;max-width:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);
  font:inherit;font-size:11px;line-height:15px;font-weight:600;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-agent-name:hover{text-decoration:underline}
.tk-agent-name:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px;border-radius:3px}
.tk-agent-mode{flex:none;font-size:9px;line-height:13px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.tk-agent-model{display:block;width:100%;min-width:0;margin-top:1px;text-align:right;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;font-size:9px;line-height:12px;
  color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.tk-agent-jump{width:18px;height:18px}
.tk-task-link{display:flex;align-items:center;gap:5px;width:100%;min-width:0;padding:3px 4px;border:0;border-radius:4px;
  background:transparent;color:inherit;font:inherit;font-size:11px;line-height:15px;text-align:left;cursor:pointer}
.tk-task-link:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent))}
.tk-task-link:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-file-link{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;padding:0;border:0;
  background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:3px}
.tk-file-link:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.tk-file-link:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-file-link>.tk-mono{min-width:0;overflow-wrap:anywhere}
.tk-btn{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:11px;line-height:15px;cursor:pointer}
.tk-btn:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent))}
.tk-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;margin-top:2px}
.tk-owner-link{display:inline-flex;align-items:center;gap:3px;vertical-align:middle;min-width:0;max-width:100%;
  padding:0;border:0;background:transparent;color:inherit;font:inherit;font-size:10px;line-height:14px;
  text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-owner-link>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-owner-link:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.tk-owner-link:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px;border-radius:3px}
.tk-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 12px;text-align:center;
  border:1px dashed var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.tk-error{display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border:1px solid var(--dsw-alias-state-error-primary);
  border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px;overflow-wrap:anywhere}
.tk-note{font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary)}
.tk-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;font-size:10px;line-height:14px;
  color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l1);padding-top:7px}
.tk-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  padding:24px;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:var(--dsw-mask-blur,blur(2px))}
.tk-insp{display:flex;flex-direction:column;width:min(680px,100%);max-height:min(82vh,760px);min-height:0;
  border:0;border-radius:var(--dsw-radius-panel,16px);background:var(--dsw-alias-bg-layer-2);
  box-shadow:var(--dsw-elevation-prominent,0 18px 48px rgba(0,0,0,.35));color:var(--dsw-alias-label-primary);overflow:hidden}
.tk-insp-head{display:flex;align-items:flex-start;gap:8px;padding:12px 14px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.tk-insp-heading{display:flex;flex-direction:column;gap:3px;min-width:0}
.tk-insp-title{margin:0;font-size:14px;line-height:20px;font-weight:600;overflow-wrap:anywhere}
.tk-insp-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0}
.tk-insp-body{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto;padding:12px 14px 16px}
.tk-insp[data-layout="task"]{width:min(920px,100%);max-width:min(920px,96vw)}
.tk-insp-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);gap:14px;align-items:stretch;
  flex:1 1 auto;min-height:0;overflow:hidden}
.tk-insp-aside{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;overflow:auto;
  overscroll-behavior:contain;padding-right:2px}
.tk-insp-main{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;overflow:hidden}
.tk-insp-main .tk-tabs{padding:0}
.tk-insp-prose{flex:1 1 auto;min-width:0;min-height:0;max-height:min(54vh,460px);overflow:auto;
  overscroll-behavior:contain;padding-right:2px}
.tk-insp-aside:focus-visible,.tk-insp-prose:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));
  outline-offset:2px;border-radius:var(--dsw-radius-sm)}
@media (max-width:640px){
  .tk-insp-split{display:flex;flex-direction:column;overflow:auto}
  .tk-insp-aside,.tk-insp-main{overflow:visible;max-height:none}
  .tk-insp-prose{max-height:none;overflow:visible}
}
.tk-tabs{display:flex;align-items:center;gap:2px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.tk-tab{position:relative;padding:6px 8px;border:0;border-bottom:2px solid transparent;background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:15px;cursor:pointer}
.tk-tab:hover{color:var(--dsw-alias-label-primary)}
.tk-tab[aria-selected="true"]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);
  font-weight:600}
.tk-tab:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-2px;border-radius:3px}
.tk-report{display:flex;flex-direction:column;gap:6px;min-width:0}
.tk-sec{display:flex;flex-direction:column;gap:4px;min-width:0}
.tk-sec-head{display:flex;align-items:center;gap:5px;min-width:0}
.tk-sec-title{margin:0;font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;
  color:var(--dsw-alias-label-secondary)}
.tk-sec-note{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.tk-body-text{margin:0;font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
.tk-body-text[data-empty="true"]{color:var(--dsw-alias-label-secondary);font-style:italic}
.tk-kv{display:grid;grid-template-columns:minmax(0,132px) minmax(0,1fr);gap:3px 10px;margin:0;font-size:11px;line-height:16px}
.tk-kv dt{min-width:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.tk-kv dd{min-width:0;margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.tk-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}
.tk-metric{display:flex;flex-direction:column;gap:1px;min-width:0;padding:7px 8px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1)}
.tk-metric-label{display:flex;align-items:center;gap:4px;font-size:9px;line-height:13px;text-transform:uppercase;
  letter-spacing:.4px;color:var(--dsw-alias-label-secondary)}
.tk-metric-value{font-size:15px;line-height:20px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.tk-metric-sub{font-size:9px;line-height:13px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.tk-list{display:flex;flex-direction:column;gap:3px;margin:0;padding:0;list-style:none;min-width:0}
.tk-list li{display:flex;align-items:flex-start;gap:5px;min-width:0;font-size:11px;line-height:16px;overflow-wrap:anywhere}
.tk-sec-scroll{max-height:168px;overflow:auto;overscroll-behavior:contain;min-width:0;padding-right:2px}
.tk-sec-scroll:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));
  outline-offset:2px;border-radius:var(--dsw-radius-sm)}
.tk-insp[data-agent-dialog] .tk-jobs,.tk-insp[data-agent-dialog] .tk-list{max-height:min(38vh,300px);overflow:auto;
  overscroll-behavior:contain;padding-right:2px}
.tk-insp[data-agent-dialog] .tk-jobs:focus-visible,.tk-insp[data-agent-dialog] .tk-list:focus-visible{
  outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px;border-radius:var(--dsw-radius-sm)}
.tk-jobs{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;min-width:0}
.tk-job{display:flex;align-items:flex-start;gap:5px;min-width:0}
.tk-job-main{display:flex;flex-direction:column;gap:1px;flex:1 1 auto;min-width:0}
.tk-job-head{display:flex;align-items:center;gap:5px;min-width:0}
.tk-job-kind{flex:none;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:9px;
  line-height:13px;color:var(--dsw-alias-label-secondary)}
.tk-job-label{min-width:0;flex:1 1 auto;font-size:11px;line-height:15px;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-job-time{flex:none;font-size:9px;line-height:13px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.tk-job-note{min-width:0;font-size:9px;line-height:13px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.tk-mono{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:10px;font-variant-numeric:tabular-nums}
.tk-warn{display:flex;align-items:flex-start;gap:5px;font-size:10px;line-height:15px;color:var(--dsw-alias-state-warn-primary);overflow-wrap:anywhere}
.tk-set{display:flex;flex-direction:column;gap:2px;min-width:0;width:100%;max-width:760px;color:var(--dsw-alias-label-primary);
  font-size:12px;line-height:17px}
.tk-set-note{margin:0 0 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.tk-set-group{display:flex;flex-direction:column;min-width:0;margin-top:10px}
.tk-set-group-title{display:flex;align-items:center;gap:5px;margin:0 0 2px;font-size:10px;line-height:14px;font-weight:600;
  text-transform:uppercase;letter-spacing:.4px;color:var(--dsw-alias-label-secondary)}
.tk-set-row{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;min-width:0;padding:10px 0;
  border-bottom:1px solid var(--dsw-alias-border-l1)}
.tk-set-row[data-stacked="true"]{border-bottom:0;padding-bottom:4px}
.tk-set-row[data-disabled="true"]{opacity:.55}
.tk-set-copy{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0}
.tk-set-title{font-size:12px;line-height:17px;font-weight:500;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.tk-set-desc{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.tk-set-control{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:none;min-width:0;padding-top:1px}
.tk-set-text-block{display:flex;flex-direction:column;gap:5px;min-width:0;padding:0 0 10px;
  border-bottom:1px solid var(--dsw-alias-border-l1)}
.tk-set-example{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace)}
.tk-set-about{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.tk-set-about .tk-btn{text-decoration:none}
.tk-set-switch{position:relative;display:inline-flex;align-items:center;flex:none;cursor:pointer}
.tk-set-switch-input{appearance:none;-webkit-appearance:none;position:absolute;inset:0;width:100%;height:100%;margin:0;
  opacity:0;cursor:pointer}
.tk-set-switch-input:disabled{cursor:not-allowed}
.tk-set-switch-track{position:relative;display:block;flex:none;width:30px;height:17px;box-sizing:border-box;
  border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);
  transition:background .12s ease,border-color .12s ease}
.tk-set-switch-track:after{content:'';position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;
  background:var(--dsw-alias-label-secondary);transition:transform .12s ease,background .12s ease}
.tk-set-switch-input:checked + .tk-set-switch-track{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);
  border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 60%,transparent)}
.tk-set-switch-input:checked + .tk-set-switch-track:after{transform:translateX(13px);background:var(--dsw-alias-brand-primary)}
.tk-set-switch-input:focus-visible + .tk-set-switch-track{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));
  outline-offset:2px}
.tk-set-switch-input:disabled + .tk-set-switch-track{opacity:.5}
@media (prefers-reduced-motion: reduce){.tk-set-switch-track,.tk-set-switch-track:after{transition:none}}
.tk-set-range{flex:0 1 200px;min-width:110px;margin:0;accent-color:var(--dsw-alias-brand-primary)}
.tk-set-range:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.tk-set-range:disabled{cursor:not-allowed}
.tk-set-value{flex:none;min-width:52px;text-align:right;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);
  font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.tk-set-text{width:100%;min-height:58px;box-sizing:border-box;resize:vertical;padding:6px 8px;
  border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:16px}
.tk-set-text:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-set-text:disabled{cursor:not-allowed;opacity:.6}
.tk-set-select{min-width:0;padding:3px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:15px;cursor:pointer}
.tk-set-select option{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.tk-set-select:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-md{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}
.tk-md-p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.tk-md-h1,.tk-md-h2,.tk-md-h3{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}
.tk-md-h1{font-size:14px;line-height:20px}
.tk-md-h2{font-size:13px;line-height:19px}
.tk-md-h3{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.2px}
.tk-md-list{margin:0;padding-left:17px;display:flex;flex-direction:column;gap:2px}
.tk-md-list li{min-width:0;overflow-wrap:anywhere}
.tk-md-quote{margin:0;padding:1px 8px;border-left:2px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.tk-md-hr{align-self:stretch;border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:3px 0}
.tk-md-pre{margin:0;max-width:100%;overflow:auto;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1)}
.tk-md code,.tk-md-code{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:10px;line-height:15px}
.tk-md-pre code{white-space:pre;display:block}
.tk-md :not(pre)>code{padding:0 3px;border-radius:3px;background:var(--dsw-alias-bg-layer-1)}
.tk-md a,.tk-md-a{color:var(--dsw-alias-brand-primary);text-decoration:underline;overflow-wrap:anywhere}
.tk-md-img{max-width:100%;max-height:320px;border-radius:var(--dsw-radius-sm);object-fit:contain;background:var(--dsw-alias-bg-layer-1)}
.tk-md-plain{overflow-wrap:anywhere}
.tk-md-file{max-width:100%}
.tk-attach{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0;margin-top:2px}
.tk-attach-label{font-size:9px;line-height:13px;text-transform:uppercase;letter-spacing:.4px;color:var(--dsw-alias-label-secondary)}
.tk-attach .tk-file-link{max-width:100%}
`

    /**
     * Attach the stylesheet to one surface.
     */
    function Styles() {
      return h('style', null, CSS)
    }

    /**
     * Stop a nested control's event from reaching the clickable surface around
     * it. An event may be absent — the smoke harness calls handlers directly —
     * so a missing one is not an error.
     * @param event - the DOM event, when there is one.
     */
    function stopEvent(event) {
      if (event !== null && typeof event === 'object' && typeof event.stopPropagation === 'function') {
        event.stopPropagation()
      }
    }

    /**
     * One titled block of the inspector or the board.
     * @param props - `title`, optional `note`, and the block content.
     */
    function Section({ title, note = undefined, icon = undefined, children }) {
      return h('section', { className: 'tk-sec' },
        h('div', { className: 'tk-sec-head' },
          icon === undefined ? null : h(Icon, { name: icon, size: 11 }),
          h('h3', { className: 'tk-sec-title' }, title),
          note === undefined || note === null ? null : h('span', { className: 'tk-sec-note' }, note)),
        children)
    }

    /**
     * A compact pill; `tone` is one of ok, info, warn, error, or undefined.
     * @param props - `tone`, optional `icon`, and the label.
     */
    function Chip({ tone = undefined, icon = undefined, title = undefined, children }) {
      return h('span', { className: 'tk-chip', 'data-tone': tone, title },
        icon === undefined ? null : h(Icon, { name: icon, size: 10 }),
        children)
    }

    /** One metric tile of the inspector. */
    function Metric({ label, value, sub = undefined, icon = undefined }) {
      return h('div', { className: 'tk-metric' },
        h('span', { className: 'tk-metric-label' }, icon === undefined ? null : h(Icon, { name: icon, size: 10 }), label),
        h('span', { className: 'tk-metric-value' }, value),
        sub === undefined || sub === null ? null : h('span', { className: 'tk-metric-sub' }, sub))
    }

    /** A card-level statistic: icon + short value. */
    function Stat({ icon, value, live = false, title = undefined }) {
      return h('span', { className: 'tk-stat', 'data-live': live, title }, h(Icon, { name: icon, size: 10 }), value)
    }

    /**
     * The product's own status dot. `idle`, `warning` and `done` are the flat
     * 6px circles the Subagents task list draws, from the same theme tokens;
     * `ongoing` is the spinning arc that list shows for a running task.
     * @param props - `state` (idle | warning | ongoing | done | error) and `size`.
     */
    function StateDot({ state, size = 10 }) {
      if (state === 'ongoing') {
        return h('span', { className: 'tk-state', 'data-state': state, 'aria-hidden': true },
          h('svg', {
            className: 'tk-spin', viewBox: '0 0 24 24', width: size, height: size,
            fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round',
          },
          h('circle', { cx: 12, cy: 12, r: 9, opacity: 0.25 }),
          h('path', { d: 'M21 12a9 9 0 0 0-9-9' })))
      }
      return h('span', {
        className: 'tk-state', 'data-state': state, 'aria-hidden': true,
        style: { width: size, height: size },
      })
    }

    /** An empty-state box. */
    function Empty({ icon = 'kanban', title, note = undefined }) {      return h('div', { className: 'tk-empty' },
        h(Icon, { name: icon, size: 20 }),
        h('span', null, title),
        note === undefined ? null : h('span', { className: 'tk-note' }, note))
    }

    /* ------------------------------------------------------------------ *
     * Safe Markdown: a self-contained renderer for task descriptions and
     * agent reports. It builds React nodes only — raw HTML is never parsed —
     * and every URL is classified before it becomes an anchor or an image.
     * ------------------------------------------------------------------ */

    /** A URL scheme prefix, e.g. `javascript:`. */
    const MD_SCHEME = /^[a-z][a-z0-9+.-]*:/i
    /** An autolinkable URL inside running text. */
    const MD_AUTOLINK = /^https?:\/\/[^\s<>"']+/i
    /** A bare workspace path: at least one `/`, optional `:line`. */
    const MD_WORKSPACE_PATH = /^[\w.@+-]+(?:\/[\w.@+-]+)+(?::\d+)?/
    /** A character that would make a path match only part of a longer token. */
    const MD_PATH_EDGE = /[\w./@+:-]/

    /**
     * The workspace path inside one `dsh-resource://file/session/<id>/<path>` address.
     * @param href - the candidate address.
     * @returns the decoded path, or undefined when it is not a file resource.
     */
    function markdownFilePathOf(href) {
      const prefix = 'dsh-resource://file/session/'
      if (href.length <= prefix.length || href.slice(0, prefix.length).toLowerCase() !== prefix) return undefined
      const rest = href.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash < 0) return undefined
      try {
        return rest.slice(slash + 1).split('/').map(segment => decodeURIComponent(segment)).join('/')
      } catch {
        return undefined
      }
    }

    /**
     * Classify one link or image target before rendering it.
     * @param raw - the target text.
     * @returns `{ kind, href?, path? }` with kind `web`, `mailto`, `file`, `plain` or `unsafe`.
     */
    function markdownTargetOf(raw) {
      const href = typeof raw === 'string' ? raw.trim() : ''
      if (href === '' || /[\u0000-\u001f]/.test(href)) return { kind: 'unsafe' }
      const resource = markdownFilePathOf(href)
      if (resource !== undefined) return { kind: 'file', path: resource, resource: true, href }
      // A Windows drive (`C:\…`) looks like a scheme but is a path.
      if (/^[a-z]:[\\/]/i.test(href) || href.startsWith('\\\\')) {
        return { kind: 'file', path: href.replace(/\\/g, '/') }
      }
      if (/^https?:\/\//i.test(href)) return { kind: 'web', href }
      if (/^mailto:/i.test(href)) return { kind: 'mailto', href }
      // Protocol-relative URLs are remote, not workspace paths; every other
      // scheme (javascript:, data:, file:, …) is refused outright.
      if (MD_SCHEME.test(href) || href.startsWith('//')) return { kind: 'unsafe' }
      if (/[\\/]/.test(href)) return { kind: 'file', path: href }
      return { kind: 'plain', href }
    }

    /**
     * Remember one file reference for the attachment chips.
     * @param context - the render context.
     * @param path - the workspace path.
     */
    function markdownRemember(context, path) {
      if (typeof path !== 'string' || path === '' || context.seen.has(path)) return
      context.seen.add(path)
      context.attachments.push(path)
    }

    /**
     * One workspace file reference as a button, so a click opens it in the
     * shipped resource viewer instead of navigating the page.
     * @param path - the workspace path.
     * @param label - the visible label.
     * @param context - the render context.
     * @param key - the React key.
     * @returns the button node.
     */
    function markdownFileNode(path, label, context, key) {
      const folder = isFolderScope(path)
      const hint = folder ? context.t('openFolderHint') : context.t('openFileHint')
      return h('button', {
        key,
        type: 'button',
        className: 'tk-file-link tk-md-file',
        'data-scope': path,
        title: hint,
        'aria-label': hint + ': ' + path,
        onClick: () => { if (typeof context.onOpenFile === 'function') context.onOpenFile(path) },
      }, h(Icon, { name: folder ? 'folder' : 'pen', size: 10 }), h('span', { className: 'tk-mono' }, label))
    }

    /**
     * Render one image target. Only `https:` and the workspace file resource
     * become an `<img>`; every other target degrades to a link or plain text.
     * @param alt - the alt text.
     * @param rawSrc - the image source.
     * @param context - the render context.
     * @param key - the React key.
     * @returns the node.
     */
    function markdownImageNode(alt, rawSrc, context, key) {
      const target = markdownTargetOf(rawSrc)
      if (target.kind === 'web') {
        return h('img', { key, className: 'tk-md-img', src: target.href, alt, loading: 'lazy' })
      }
      if (target.kind === 'file' && target.resource === true) {
        markdownRemember(context, target.path)
        return h('img', { key, className: 'tk-md-img', src: target.href, alt, loading: 'lazy' })
      }
      if (target.kind === 'file') {
        markdownRemember(context, target.path)
        return markdownFileNode(target.path, alt !== '' ? alt : target.path, context, key)
      }
      return h('span', { key, className: 'tk-md-plain' }, alt !== '' ? alt : rawSrc)
    }

    /**
     * Render one link target, allowing only http(s), mailto and workspace
     * paths; anything else keeps its text and drops the target. The label is
     * rendered without autolinks: an anchor cannot contain a nested link or
     * file button.
     * @param label - the link label Markdown.
     * @param rawHref - the link target.
     * @param context - the render context.
     * @param key - the React key.
     * @returns the node.
     */
    function markdownLinkNode(label, rawHref, context, key) {
      const target = markdownTargetOf(rawHref)
      if (target.kind === 'web' || target.kind === 'mailto') {
        return h('a', {
          key,
          className: 'tk-md-a',
          href: target.href,
          target: '_blank',
          rel: 'noreferrer noopener',
        }, markdownInline(label, { ...context, noAutoLinks: true }))
      }
      if (target.kind === 'file') {
        markdownRemember(context, target.path)
        return markdownFileNode(target.path, label, context, key)
      }
      return h('span', { key, className: 'tk-md-plain' }, markdownInline(label, { ...context, noAutoLinks: true }))
    }

    /**
     * Find a bare workspace path that starts at `index` in running prose.
     *
     * A path needs at least one `/`; a domain followed by a slash stays a URL
     * and a version string has no slash at all. The `:line` suffix belongs to
     * the visible label only, so the click opens the file itself. Trailing
     * sentence punctuation is left outside the link.
     * @param text - the inline source.
     * @param index - the candidate offset.
     * @returns `{ label, path }`, or undefined when no path starts here.
     */
    function markdownWorkspacePathAt(text, index) {
      const match = MD_WORKSPACE_PATH.exec(text.slice(index))
      if (match === null) return undefined
      const previous = index === 0 ? '' : text[index - 1]
      if (previous !== '' && MD_PATH_EDGE.test(previous)) return undefined
      // A domain with a path (`example.com/readme`) is a URL, not a file.
      const firstSegment = match[0].slice(0, match[0].indexOf('/'))
      if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(firstSegment)) return undefined
      const label = match[0].replace(/[.,;!?]+$/, '')
      if (label === '' || label.indexOf('/') < 0) return undefined
      return { label, path: label.replace(/:\d+$/, '') }
    }

    /**
     * Render inline Markdown: bold, italic, code, links, images and autolinks.
     * The returned children are strings or React elements, so React escapes
     * every piece of text and no HTML is ever injected.
     * @param text - the inline source.
     * @param context - the render context; `noAutoLinks` keeps a link label
     *   free of nested links and file buttons.
     * @returns the child nodes.
     */
    function markdownInline(text, context) {
      const nodes = []
      let plain = ''
      let index = 0
      let key = 0
      const flush = () => {
        if (plain === '') return
        nodes.push(plain)
        plain = ''
      }
      const push = node => {
        flush()
        nodes.push(node)
        key += 1
      }
      while (index < text.length) {
        const char = text[index]
        if (char === '\\' && index + 1 < text.length) {
          plain += text[index + 1]
          index += 2
          continue
        }
        if (char === '\n') {
          push(h('br', { key: 'br-' + key }))
          index += 1
          continue
        }
        if (char === '`') {
          const end = text.indexOf('`', index + 1)
          if (end > index + 1) {
            push(h('code', { key: 'code-' + key, className: 'tk-md-code' }, text.slice(index + 1, end)))
            index = end + 1
            continue
          }
        }
        if (char === '!' && text[index + 1] === '[') {
          const close = text.indexOf('](', index + 2)
          if (close > index + 2) {
            const end = text.indexOf(')', close + 2)
            if (end > close + 2) {
              push(markdownImageNode(text.slice(index + 2, close), text.slice(close + 2, end), context, 'img-' + key))
              index = end + 1
              continue
            }
          }
        }
        if (char === '[') {
          const close = text.indexOf('](', index + 1)
          if (close > index + 1) {
            const end = text.indexOf(')', close + 2)
            if (end > close + 2) {
              push(markdownLinkNode(text.slice(index + 1, close), text.slice(close + 2, end), context, 'a-' + key))
              index = end + 1
              continue
            }
          }
        }
        if (char === '*' || char === '_') {
          const double = text.slice(index, index + 2) === char + char
          const marker = double ? char + char : char
          if (char === '_' && !double && index > 0 && /[a-z0-9]/i.test(text[index - 1])) {
            plain += char
            index += 1
            continue
          }
          const end = text.indexOf(marker, index + marker.length)
          if (end > index + marker.length) {
            const inner = text.slice(index + marker.length, end)
            push(h(double ? 'strong' : 'em', { key: (double ? 'strong-' : 'em-') + key },
              markdownInline(inner, context)))
            index = end + marker.length
            continue
          }
        }
        // A link label must stay plain text: an autolink inside an anchor
        // would nest an <a> or a <button> in an <a>, which the HTML parser
        // cannot represent.
        if (context.noAutoLinks !== true) {
          const autolink = MD_AUTOLINK.exec(text.slice(index))
          if (autolink !== null) {
            const href = autolink[0].replace(/[.,;:!?]+$/, '')
            if (href.length > 8) {
              push(h('a', {
                key: 'auto-' + key,
                className: 'tk-md-a',
                href,
                target: '_blank',
                rel: 'noreferrer noopener',
              }, href))
              index += href.length
              continue
            }
          }
          const workspacePath = markdownWorkspacePathAt(text, index)
          if (workspacePath !== undefined) {
            markdownRemember(context, workspacePath.path)
            push(markdownFileNode(workspacePath.path, workspacePath.label, context, 'path-' + key))
            index += workspacePath.label.length
            continue
          }
        }
        plain += char
        index += 1
      }
      flush()
      return nodes
    }

    /**
     * Whether a source line opens a block, so a paragraph must stop before it.
     * @param line - one source line.
     * @returns whether the line starts a block.
     */
    function markdownStartsBlock(line) {
      return /^```/.test(line)
        || /^#{1,3}\s+/.test(line)
        || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
        || /^\s*>/.test(line)
        || /^\s*[-*+]\s+/.test(line)
        || /^\s*\d+[.)]\s+/.test(line)
    }

    /**
     * Parse the block subset: fenced code, headings 1–3, rules, quotes, lists
     * and paragraphs. Everything else stays plain text inside a paragraph.
     * @param text - the normalized source.
     * @param context - the render context.
     * @returns the block nodes.
     */
    function markdownBlocks(text, context) {
      const lines = text.split('\n')
      const blocks = []
      let index = 0
      let key = 0
      while (index < lines.length) {
        const line = lines[index]
        if (/^\s*$/.test(line)) {
          index += 1
          continue
        }
        const fence = /^```\s*([\w+-]*)\s*$/.exec(line)
        if (fence !== null) {
          const code = []
          index += 1
          while (index < lines.length && !/^```\s*$/.test(lines[index])) {
            code.push(lines[index])
            index += 1
          }
          if (index < lines.length) index += 1
          blocks.push(h('pre', { key: 'pre-' + key, className: 'tk-md-pre' },
            h('code', { className: 'tk-md-code' }, code.join('\n'))))
          key += 1
          continue
        }
        const heading = /^(#{1,3})\s+(.+?)\s*$/.exec(line)
        if (heading !== null) {
          const level = heading[1].length
          blocks.push(h('h' + String(level), { key: 'h-' + key, className: 'tk-md-h' + String(level) },
            markdownInline(heading[2], context)))
          key += 1
          index += 1
          continue
        }
        if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
          blocks.push(h('hr', { key: 'hr-' + key, className: 'tk-md-hr' }))
          key += 1
          index += 1
          continue
        }
        if (/^\s*>/.test(line)) {
          const quote = []
          while (index < lines.length && /^\s*>/.test(lines[index])) {
            quote.push(lines[index].replace(/^\s*>\s?/, ''))
            index += 1
          }
          blocks.push(h('blockquote', { key: 'quote-' + key, className: 'tk-md-quote' },
            markdownInline(quote.join('\n'), context)))
          key += 1
          continue
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          const items = []
          while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
            items.push(lines[index].replace(/^\s*[-*+]\s+/, ''))
            index += 1
          }
          blocks.push(h('ul', { key: 'ul-' + key, className: 'tk-md-list' },
            items.map((item, itemIndex) => h('li', { key: itemIndex }, markdownInline(item, context)))))
          key += 1
          continue
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const items = []
          while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
            items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''))
            index += 1
          }
          blocks.push(h('ol', { key: 'ol-' + key, className: 'tk-md-list' },
            items.map((item, itemIndex) => h('li', { key: itemIndex }, markdownInline(item, context)))))
          key += 1
          continue
        }
        const paragraph = [line]
        index += 1
        while (index < lines.length && !/^\s*$/.test(lines[index]) && !markdownStartsBlock(lines[index])) {
          paragraph.push(lines[index])
          index += 1
        }
        blocks.push(h('p', { key: 'p-' + key, className: 'tk-md-p' },
          markdownInline(paragraph.join('\n'), context)))
        key += 1
      }
      return blocks
    }

    /**
     * Render one description or report as safe Markdown plus attachment chips.
     * The task record carries no attachment field, so file references in the
     * text itself are what the chips collect.
     * @param props - `text`, optional `onOpenFile` and `t`.
     */
    function Markdown({ text, onOpenFile = undefined, t = undefined }) {
      const translate = typeof t === 'function' ? t : key => key
      const context = { onOpenFile, t: translate, attachments: [], seen: new Set() }
      const source = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : ''
      const blocks = markdownBlocks(source, context)
      if (context.attachments.length > 0) {
        blocks.push(h('div', { key: 'attachments', className: 'tk-attach', 'data-attachments': 'true' },
          h('span', { className: 'tk-attach-label' }, translate('attachments')),
          context.attachments.map((path, pathIndex) => markdownFileNode(path, path, context, 'attach-' + pathIndex))))
      }
      return h('div', { className: 'tk-md', 'data-markdown': 'true' }, blocks)
    }

    /**
     * The disclosure button a foldable section header carries. It stays
     * mounted across a toggle, so keyboard focus survives the fold.
     * @param props - `expanded`, `label` (the aria-label), `target` and `onClick`.
     */
    function FoldToggle({ expanded, label, target, onClick }) {
      return h('button', {
        type: 'button',
        className: 'tk-fold',
        'data-fold': 'section',
        'data-target': target,
        'aria-expanded': expanded === true ? 'true' : 'false',
        'aria-label': label,
        title: label,
        onClick: () => { onClick(target) },
      }, h(Icon, { name: 'chevron-down', size: 11, className: 'tk-chevron' }))
    }

    /**
     * A titled block of the inspector that folds away and scrolls once it
     * outgrows the dialog. The header keeps its note (the item count), so a
     * folded block still says how much it holds. The scroll box is focusable,
     * so a keyboard reader can scroll it without a mouse. A list that is its
     * own scroll box passes `scroll: false` and owns the focusable region.
     * @param props - `title`, optional `icon` and `note`, plus `target`,
     *   `expanded`, `label`, `onToggle`, optional `scroll` and the content.
     */
    function FoldSection({ title, icon = undefined, note = undefined, target, expanded, label, onToggle, scroll = true, children }) {
      return h('section', { className: 'tk-sec', 'data-fold-block': target },
        h('div', { className: 'tk-sec-head' },
          h(FoldToggle, { expanded, label, target, onClick: onToggle }),
          icon === undefined ? null : h(Icon, { name: icon, size: 11 }),
          h('h3', { className: 'tk-sec-title' }, title),
          note === undefined || note === null ? null : h('span', { className: 'tk-sec-note' }, note)),
        expanded === true
          ? (scroll === false
            ? children
            : h('div', {
              className: 'tk-sec-scroll',
              tabIndex: 0,
              role: 'group',
              'aria-label': title,
            }, children))
          : null)
    }

    /* ------------------------------------------------------------------ *
     * Formatters
     * ------------------------------------------------------------------ */

    /**
     * Capitalize the first letter of an id so a raw reasoning-effort id reads
     * like the catalog name (`high` -> `High`).
     * @param value - the id.
     * @returns the capitalized text.
     */
    function capitalize(value) {
      const text = String(value ?? '')
      if (text === '') return text
      return text.charAt(0).toUpperCase() + text.slice(1)
    }
    /**
     * Coerce a value to a finite number.
     * @param value - anything.
     * @param fallback - used when the value is not finite.
     * @returns the number.
     */
    function num(value, fallback = 0) {
      const parsed = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }

    /**
     * Russian plural form picker over three dictionary keys.
     * @param t - translate function.
     * @param count - the amount.
     * @param keys - [one, few, many] dictionary keys.
     * @returns the chosen word.
     */
    function plural(t, count, keys) {
      const mod10 = count % 10
      const mod100 = count % 100
      if (mod10 === 1 && mod100 !== 11) return t(keys[0])
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t(keys[1])
      return t(keys[2])
    }

    /**
     * Format a millisecond span as an hours/minutes/seconds phrase.
     * @param ms - the span.
     * @param t - translate function.
     * @param compact - when true, drop the space before units.
     * @returns the localized span, e.g. `1 ч 04 мин`.
     */
    function formatSpan(ms, t, compact = false) {
      const total = Math.max(0, Math.round(num(ms) / 1000))
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = total % 60
      const sep = compact ? '' : ' '
      const part = (value, key) => String(value) + sep + t(key)
      if (hours > 0) return part(hours, 'unitHour') + ' ' + part(minutes, 'unitMin')
      if (minutes > 0) return part(minutes, 'unitMin') + (compact ? '' : ' ' + part(seconds, 'unitSec'))
      return part(seconds, 'unitSec')
    }

    /**
     * Format a token count with a K/M/B suffix.
     * @param value - the count.
     * @returns the abbreviated number.
     */
    function formatTokens(value) {
      const count = Math.max(0, num(value))
      if (count < 1000) return String(Math.round(count))
      if (count < 1e6) return (count / 1e3).toFixed(count < 1e4 ? 1 : 0) + 'K'
      if (count < 1e9) return (count / 1e6).toFixed(count < 1e7 ? 1 : 0) + 'M'
      return (count / 1e9).toFixed(1) + 'B'
    }

    /**
     * Format a money amount; sub-cent amounts keep four decimals.
     * @param value - the amount.
     * @param symbol - currency sign.
     * @returns the formatted amount, e.g. `$1.24`.
     */
    function formatMoney(value, symbol = '$') {
      const amount = num(value)
      if (!Number.isFinite(amount)) return '—'
      if (amount === 0) return symbol + '0'
      if (Math.abs(amount) < 0.01) return symbol + amount.toFixed(4)
      return symbol + amount.toFixed(2)
    }

    /**
     * Format an hours quantity with one decimal below ten hours.
     * @param hours - the quantity.
     * @returns the formatted number, e.g. `2.4 h`.
     */
    function formatHours(hours) {
      const value = Math.max(0, num(hours))
      if (value === 0) return '0'
      if (value < 10) return Number.isInteger(value) ? String(value) : value.toFixed(1)
      return String(Math.round(value))
    }

    /**
     * Format an instant as a clock time today, or as a date and a clock time
     * when it is older.
     * @param time - unix milliseconds.
     * @returns `HH:MM` or `DD.MM HH:MM`, or an em dash when unknown.
     */
    function formatStamp(time) {
      const stamp = num(time, 0)
      if (stamp <= 0) return '—'
      const date = new Date(stamp)
      const pad = value => String(value).padStart(2, '0')
      const clock = pad(date.getHours()) + ':' + pad(date.getMinutes())
      const today = new Date()
      const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate()
      return sameDay ? clock : pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + ' ' + clock
    }

    /**
     * Format a wall-clock instant as a local time.
     * @param time - unix milliseconds.
     * @returns `HH:MM`, or an em dash when unknown.
     */
    function formatClock(time) {
      const stamp = num(time, 0)
      if (stamp <= 0) return '—'
      const date = new Date(stamp)
      const pad = value => String(value).padStart(2, '0')
      return pad(date.getHours()) + ':' + pad(date.getMinutes())
    }
