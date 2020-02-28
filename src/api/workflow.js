import * as manageAPI from "@/api/manage";
import * as tools from "@/utils/util";

/**
 * @function 审批同意处理
 * @param tableName 审批处理关联的业务表
 * @param curRow    审批处理关联的业务数据
 * @param pnode     审批处理下一节点的审批信息
 * @param prLogHisNode     审批处理当前节点的审批信息
 * @param bpmStatus 审批处理关联的业务数据应变更的状态
 * @define bpmStatus（1：待提交	2：审核中	3：审批中	4：已完成	5：已完成 10：已作废）
 */
export async function postWorkflowApprove(tableName, curRow, operationData, pnode, prLogHisNode, bpmStatus) {

    //执行处理的结果
    var result = null;

    //流程事务处理框架，保证流程处理操作的事务最终一致性
    try {
        //执行事务处理框架
        result = await manageAPI.postTableData(
            "BS_TRANSACTION",
            operationData
        );
    } catch (error) {
        console.log("流程事务处理框架处理异常", error);
    }

    try {
        //如果“审批处理下一节点的审批信息”不为空，则执行当前处理
        if (pnode != null) {
            //向流程审批日志表PR_LOG和审批处理表BS_APPROVE添加数据 , 并获取审批处理返回信息
            result = await manageAPI.postProcessLog(pnode);
        }
    } catch (error) {
        console.log("审批处理下一节点的审批信息", error);
    }

    try {
        //如果“审批处理当前节点的审批信息”不为空，则执行当前处理
        if (tableName != null && curRow != null && prLogHisNode != null && bpmStatus != null) {
            //将当前审批日志转为历史日志，并删除当前审批日志中相关信息
            result = await manageAPI.postProcessLogHistory(prLogHisNode);

            //删除当前审批节点中的所有记录
            result = await manageAPI.deleteProcessLog(
                tableName,
                prLogHisNode
            );
            //修改审批状态为审批中，并记录审批日志；将当前审批状态修改为处理中 
            result = await manageAPI.patchTableData(
                tableName,
                curRow["business_data_id"],
                bpmStatus
            );

            //如果本次流程结束，即状态变为已完成，或者，状态变成，待处理，则将当前的自由流程记录转为历史，以前此表单的自由流程进入历史，并删除以前此表单对应的自由流程
            result = await manageAPI.transFreeWflowHis(curRow["business_data_id"]);
        }
    } catch (error) {
        console.log("审批处理当前节点的审批信息", error);
    }

    //返回执行结果
    return result;

}

/**
 * @function 处理自由流程发起提交审批操作
 * @param tableName     表单名称
 * @param curRow        当前记录数
 * @param freeWFNode    自由流程节点
 * @param startFreeNode 流程发起节点
 * @param nextWflowNode 下一流程处理节点
 * @param bpmStatus   审批处理关联的业务数据应变更的状态
 * @define bpmStatus （1：待提交	2：审核中	3：审批中	4：已完成	5：已完成 10：已作废）
 */
export async function postWorkflowFree(tableName, curRow, freeWFNode, startFreeNode, nextWflowNode, bpmStatus) {

    //执行处理的结果
    var result = null;

    //状态节点
    var statusNode = {
        bpm_status: bpmStatus
    };

    try {

        //将审批用户记录，知会用户记录，写入相应的自由流程表单中
        result = await manageAPI.postProcessFreeNode(freeWFNode);

        //向流程审批日志表PR_LOG和审批处理表BS_APPROVE添加数据 , 并获取审批处理返回信息
        result = await manageAPI.postProcessLogHistory(startFreeNode);

        //向流程审批日志表PR_LOG和审批处理表BS_APPROVE添加数据 , 并获取审批处理返回信息
        result = await manageAPI.postProcessLog(nextWflowNode);

        //第四步，修改审批状态为审批中，并记录审批日志；将当前审批状态修改为处理中 （1:待提交 2:处理中 3:审批中 4:已完成 5:已完成） //修改审批状态为处理中，并记录审批日志；将当前审批状态修改为处理中 
        result = await manageAPI.patchTableData(
            tableName,
            curRow["id"],
            statusNode
        );


    } catch (error) {
        console.log("处理自由流程发起提交审批操作异常：" + error)
    }

    //返回执行结果
    return result;

}

/**
 * @function 校验自由流程提交信息是否准确
 * @param wfUsers 审核人员
 * @param nfUsers 知会人员
 * @param approver 审批人员
 * @param pageType page类型
 * @param $confirm 提示函数
 */
export function checkSubmitInfo(wfUsers, nfUsers, approver, pageType, $confirm) {

    try {

        //审批用户不能为空
        if (tools.deNull(approver) == "" && pageType == "workflowing") {
            $confirm({
                title: "温馨提示",
                content: "请选择审批用户!"
            });
            return false;
        }

        //如果审批用户含有多个，则不能提交
        if (tools.deNull(approver).includes(",") && pageType == "workflowing") {
            $confirm({
                title: "温馨提示",
                content: "审批用户只能选择一个!"
            });
            return false;
        }

        //知会用户不能为空
        if (tools.deNull(nfUsers) == "" && pageType == "notifying") {
            //显示提示信息
            $confirm({
                title: "温馨提示",
                content: "请选择知会用户!"
            });
            return false;
        }

        //如果审批人员，出现在审核流程中，则提示错误
        if (("," + wfUsers + ",").includes("," + approver + ",") && pageType == "workflowing") {
            //显示提示信息
            $confirm({
                title: "温馨提示",
                content: `审批流程中，审批人员[${approver}]不能出现在审核人员中!`
            });
            return false;
        }

    } catch (error) {
        console.log("check submit info error : " + error);
    }

    return true;
}


/**
 * @function 将当前自由流程的数据转移到历史数据中
 * @param {*} id 
 */
export async function transFreeWflowHis(id) {

    //定义返回结果
    var result;

    try {

        //获取本表单业务的所有的自由流程数据
        let wflist = await manageAPI.queryHisFreeWorkflow(id);

        //将历史数据插入到历史自由流程表中
        let wcode = await manageAPI.insertTableData("bs_free_process_h", wflist);

        //删除当前自由流程表中历史数据
        result = await manageAPI.deleteTableItem("bs_free_process", wflist);

        //打印返回结果
        console.log("result :" + result + " wcode :" + wcode);


    } catch (error) {
        console.log("transfer free workflow node into history " + error);
    }

    return result;

}