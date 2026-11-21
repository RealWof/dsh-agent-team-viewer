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
.tk-readonly{display:inline-flex;align-items:center;gap:3px;flex:none;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:999px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}
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
.tk-agent-info,.tk-agent-jump{width:18px;height:18px}
.tk-task-link{display:flex;align-items:center;gap:5px;width:100%;min-width:0;padding:3px 4px;border:0;border-radius:4px;
  background:transparent;color:inherit;font:inherit;font-size:11px;line-height:15px;text-align:left;cursor:pointer}
.tk-task-link:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent))}
.tk-task-link:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
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
.tk-set{display:flex;flex-direction:column;gap:12px;min-width:0;max-width:560px;color:var(--dsw-alias-label-primary);
  font-size:12px;line-height:17px}
.tk-set-hint{display:block;margin:0;font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));
  overflow-wrap:anywhere}
.tk-set-example{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace)}
.tk-set-check{display:flex;align-items:center;gap:7px;min-width:0;font-size:12px;line-height:17px;cursor:pointer}
.tk-set-check input{flex:none;margin:0;accent-color:var(--dsw-alias-brand-primary)}
.tk-set-check input:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.tk-set-field{display:flex;align-items:center;gap:8px;min-width:0;padding:1px 0}
.tk-set-field[data-disabled="true"]{opacity:.55}
.tk-set-label{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.tk-set-range{flex:1 1 auto;min-width:96px;margin:0;accent-color:var(--dsw-alias-brand-primary)}
.tk-set-range:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.tk-set-range:disabled{cursor:not-allowed}
.tk-set-value{flex:none;min-width:56px;text-align:right;font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);
  font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.tk-set-text{width:100%;min-height:58px;box-sizing:border-box;resize:vertical;padding:5px 7px;
  border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:16px}
.tk-set-text:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
.tk-set-text:disabled{cursor:not-allowed;opacity:.6}
.tk-set-select{min-width:0;padding:3px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:15px;cursor:pointer}
.tk-set-select:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}
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
     * so a keyboard reader can scroll it without a mouse.
     * @param props - `title`, optional `icon` and `note`, plus `target`,
     *   `expanded`, `label`, `onToggle` and the block content.
     */
    function FoldSection({ title, icon = undefined, note = undefined, target, expanded, label, onToggle, children }) {
      return h('section', { className: 'tk-sec', 'data-fold-block': target },
        h('div', { className: 'tk-sec-head' },
          h(FoldToggle, { expanded, label, target, onClick: onToggle }),
          icon === undefined ? null : h(Icon, { name: icon, size: 11 }),
          h('h3', { className: 'tk-sec-title' }, title),
          note === undefined || note === null ? null : h('span', { className: 'tk-sec-note' }, note)),
        expanded === true
          ? h('div', {
            className: 'tk-sec-scroll',
            tabIndex: 0,
            role: 'group',
            'aria-label': title,
          }, children)
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
