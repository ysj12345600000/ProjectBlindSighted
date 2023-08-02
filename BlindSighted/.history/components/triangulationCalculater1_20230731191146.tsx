import React, { useState} from 'react';
import {Alert, NativeModules} from 'react-native';
import * as numeric from 'numeric';
import { ConnectedDeciceInfo, RssiInfo } from '../components/BleOperation1';

export interface DsitanceCalculateParams {

    // x: Initial estimate
    // A  State transition matrix
    // H Measurement matrix
    // Q Process noise covariance
    // R Measurement noise covariance
    // P Initial estimate error covariance

    // N Path loss exponent
    macId : string;
    deviceName : string;
    rssiRef: number;
    x : number;
    A : number;
    H : number;
    N : number;
    P : number;
    Q : number;
    R : number;
    distance : number;
    position : [x : number, y : number, z : number];
    angle : number;
};


export const triangulationCalculater = () => {
    const [ estimatedDistance, setEstimatedDistance ] = useState<number | null>(null); //估计距离

    // removing extreme values
    const trimmRssiList = (currentRssiList:number[], trimPercent:number) => {
        currentRssiList.sort();
        const trimLength = Math.floor(currentRssiList.length * trimPercent);
        currentRssiList.splice(-trimLength-1, trimLength+1);
        currentRssiList.splice(0, trimLength-1);
        return currentRssiList;
    };

    // kalman filter
    function kalmanFilter(dsitanceCalculateParams : DsitanceCalculateParams, rssiList: number[]) {

        // Parameters
        // x: Initial estimate
        // A  State transition matrix
        // H Measurement matrix
        // Q Process noise covariance
        // R Measurement noise covariance
        // P Initial estimate error covariance
        const estimates = [];
        const predictions = [];

        let P = dsitanceCalculateParams.P;
        let x = dsitanceCalculateParams.x;

        for (let k=0; k< rssiList.length; k++){
                    
            
                    // Prediction
                    const x_hat = dsitanceCalculateParams.A * dsitanceCalculateParams.x;
                    const P_hat = dsitanceCalculateParams.A * P * dsitanceCalculateParams.A + dsitanceCalculateParams.Q; 
                    
                    // Update
                    const K = P_hat * dsitanceCalculateParams.H / (dsitanceCalculateParams.H * P_hat * dsitanceCalculateParams.H + dsitanceCalculateParams.R);
                    x = x_hat + K * (rssiList[k] - dsitanceCalculateParams.H * x_hat);
                    P = (1 - K * dsitanceCalculateParams.H) * P_hat;
                    
                    estimates[k] = x;
                    predictions[k] = x_hat;
        }

            return estimates;
        
    };

    // average 
    function average(arr:number[]){
        const sum = arr.reduce((acc, val) => acc + val, 0);
        return sum / arr.length;
    };

    
    const calculateDistance = async (dsitanceCalculateParams : DsitanceCalculateParams, rssiList: RssiInfo) => {
        let currentRssiList = rssiList.rssiList;
        console.log("currentRssiList", currentRssiList);

        //去除极端值
        currentRssiList = trimmRssiList(currentRssiList, 0.1);
        console.log('去除极端值后的RSSI列表', currentRssiList);
        
        dsitanceCalculateParams.x = average(currentRssiList);

        //滤波
        let estimatedRSSI = average(kalmanFilter(dsitanceCalculateParams, currentRssiList));
        console.log('滤波后的RSSI', estimatedRSSI);
    
        const distance = Math.pow(10, (dsitanceCalculateParams.rssiRef-estimatedRSSI)/(10*dsitanceCalculateParams.N));
        setEstimatedDistance(distance);
        console.log('设备名称', dsitanceCalculateParams.deviceName,'估计距离', distance);

        return distance;
    };

    const calculateDistances = async (connectDevicesInfoList: ConnectedDeciceInfo[], rssiLists: RssiInfo[]) => {
        
        let distanceCalculateParamsCopy = connectDevicesInfoList;
        console.log("distanceCalculateParamsCopy", distanceCalculateParamsCopy);
        for(let i=0; i<distanceCalculateParamsCopy.length; i++){
            if(distanceCalculateParamsCopy[i].distanceCalculateParams){
                const distance = await calculateDistance(distanceCalculateParamsCopy[i].distanceCalculateParams!, rssiLists[i]);
                distanceCalculateParamsCopy[i].distanceCalculateParams!.distance = distance;
            }
        return distanceCalculateParamsCopy;
    }

    // 最小二乘法获取用户位置
    const getUsersPosition = async (connectDevicesInfoList: ConnectedDeciceInfo[], userHeight: number) => {
        if(connectDevicesInfoList.length < 3){
            Alert.alert("请连接至少三个设备");
            return;
        }

        const [p1, p2, p3, ...rest] = connectDevicesInfoList;
        const ex = normalize(subtract(p2.distanceCalculateParams!.position, p1.distanceCalculateParams!.position));
        const i = dot(ex, subtract(p3.distanceCalculateParams!.position, p1.distanceCalculateParams!.position));
        const ey = normalize(subtract(subtract(p3.position, p1.position), scale(ex, i)));
        const ez = cross(ex, ey);
        const d = norm(subtract(p2.position, p1.position));
        const j = dot(ey, subtract(p3.position, p1.position));
    
        const x = (Math.pow(p1.distance, 2) - Math.pow(p2.distance, 2) + Math.pow(d, 2)) / (2 * d);
        const y = (Math.pow(p1.distance, 2) - Math.pow(p3.distance, 2) + Math.pow(i, 2) + Math.pow(j, 2)) / (2 * j) - (i / j) * x;
    
        let z = Math.pow(p1.distance, 2) - Math.pow(x, 2) - Math.pow(y, 2);
        if (z < 0) {
            console.warn('User is out of range');
            z = 0;
        }
        z = Math.sqrt(z);
    
        const triPt = add(p1.position, add(scale(ex, x), add(scale(ey, y), scale(ez, z))));
    
        for (const dp of rest) {
            const distance = norm(subtract(dp.position, triPt));
            if (Math.abs(distance - dp.distance) > 0.1) {  // you can adjust the error range here
                console.warn('Measurement is inconsistent');
            }
        }
    
        console.log('Estimated user position is', triPt);
        return triPt;



    

   
    
    function dot(u: number[], v: number[]): number {
        let sum = 0;
        for (let i = 0; i < u.length; i++) {
            sum += u[i] * v[i];
        }
        return sum;
    }
    
    function norm(v: number[]): number {
        return Math.sqrt(dot(v, v));
    }
    
    function subtract(v1: number[], v2: number[]): number[] {
        const diff: number[] = [];
        for (let i = 0; i < v1.length; i++) {
            diff.push(v1[i] - v2[i]);
        }
        return diff;
    }
    
    function add(v1: number[], v2: number[]): number[] {
        const sum: number[] = [];
        for (let i = 0; i < v1.length; i++) {
            sum.push(v1[i] + v2[i]);
        }
        return sum;
    }
    
    function scale(v: number[], factor: number): number[] {
        return v.map(n => n * factor);
    }
    
    function normalize(v: number[]): number[] {
        const magnitude = norm(v);
        return scale(v, 1 / magnitude);
    }
    
    function cross(u: number[], v: number[]): number[] {
        return [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0]
        ];
    }

     // 计算两个向量的叉积
     function crossProduct(u: Vector2D, v: Vector2D): number {
        return u.x * v.y - u.y * v.x;
    }
    
    // 计算向量的模长
    function magnitude(v: Vector2D): number {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    }

    function cartesianToPolar(x: number, y: number) {
        //获取极坐标下的角度
        const r = Math.sqrt(x * x + y * y);
        const theta = Math.atan2(y, x);
        return theta * (180 / Math.PI);
    }

    type Vector2D = {
        x: number;
        y: number;
    };
    
    return{
        calculateDistance,
        getUsersPosition,
        calculateDistances,
        angleDifference,
        
    }

};

export default triangulationCalculater;