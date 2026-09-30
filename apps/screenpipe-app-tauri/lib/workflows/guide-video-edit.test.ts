// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { beforeEach, expect, it, vi } from "vitest";
const run=vi.hoisted(()=>vi.fn());
vi.mock("./agent-runner",()=>({runWorkflowAgent:run}));
vi.mock("./assistant",()=>({assistantProviderConfig:{provider:"screenpipe-cloud",model:"auto"}}));
import { editGuideVideo } from "./guide-video-edit";
import videoTool from "../../../../packages/workflows-ui/src/video-tool";
const draft={version:1 as const,sourceHash:"abc",scenes:[{id:"section-0",title:"Start",narration:"Read all sources carefully.",includeImage:false}]};
beforeEach(()=>vi.clearAllMocks());
it("uses the scoped tool and sends a single text-only draft with bounded history",async()=>{
 let tool:any;videoTool({registerTool:(t:any)=>tool=t});
 run.mockImplementation(async({onEvent})=>{onEvent({type:"tool_execution_end",toolName:"edit_video_sop",result:await tool.execute("1",{changes:[{id:"section-0",narration:"Read sources."}],render:false})});return "Updated";});
 const history=Array.from({length:20},()=>({id:"id",role:"user" as const,text:"x".repeat(2000),at:"now",context:{key:"private",title:"secret catalog"}}));
 const output=await editGuideVideo(draft,"Shorten it",history,new AbortController().signal,()=>{});
 expect(output.changed).toBe(true);expect(output.render).toBe(false);expect(output.draft.scenes[0].narration).toBe("Read sources.");
 const request=run.mock.calls[0][0];expect(request.config.allowedTools).toEqual(["edit_video_sop"]);
 expect(request.prompt).not.toContain("secret catalog");expect(request.prompt.length).toBeLessThan(12000);
});
it("rejects multiple patches and cancelled turns",async()=>{
 const event={type:"tool_execution_end",toolName:"edit_video_sop",result:{content:[{text:JSON.stringify({changes:[],render:true})}]}};
 run.mockImplementation(async({onEvent})=>{onEvent(event);onEvent(event);return "";});
 await expect(editGuideVideo(draft,"Render",[],new AbortController().signal,()=>{})).rejects.toThrow(/one combined/);
 const abort=new AbortController();run.mockImplementation(async()=>{abort.abort();return "";});
 await expect(editGuideVideo(draft,"Render",[],abort.signal,()=>{})).rejects.toThrow();
});
