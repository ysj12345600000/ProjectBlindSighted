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
    };

    // 最小二乘法获取用户位置
    const getUsersPosition = async (connectDevicesInfoList: ConnectedDeciceInfo[], userHeight: number) => {
        if(connectDevicesInfoList.length < 3){
            Alert.alert("请连接至少三个设备");
            return;
        }

        const [p1, p2, p3, ...rest] = connectDevicesInfoList;
        const ex = normalize(subtract(p2.distanceCalculateParams!.position, p1.distanceCalculateParams!.position));
        const i = dot(ex, subtract(p3.distanceCalculateParams!.position, p1.distanceCalculateParams!.position));
        const ey = normalize(subtract(subtract(p3.distanceCalculateParams!.position, p1.distanceCalculateParams!.position), scale(ex, i)));
        const ez = cross(ex, ey);
        const d = norm(subtract(p2.distanceCalculateParams!.position, p1.distanceCalculateParams!.position));
        const j = dot(ey, subtract(p3.distanceCalculateParams!.position, p1.distanceCalculateParams!.position));
    
        const x = (Math.pow(p1.distanceCalculateParams!.distance, 2) - Math.pow(p2.distanceCalculateParams!.distance, 2) + Math.pow(d, 2)) / (2 * d);
        const y = (Math.pow(p1.distanceCalculateParams!.distance, 2) - Math.pow(p3.distanceCalculateParams!.distance, 2) + Math.pow(i, 2) + Math.pow(j, 2)) / (2 * j) - (i / j) * x;
    
        let z = Math.pow(p1.distanceCalculateParams!.distance, 2) - Math.pow(x, 2) - Math.pow(y, 2);
        if (z < 0) {
            console.warn('User is out of range');
            z = 0;
        }
        z = Math.sqrt(z);
    
        const triPt = add(p1.distanceCalculateParams!.position, add(scale(ex, x), add(scale(ey, y), scale(ez, z))));
    
        for (const dp of rest) {
            const distance = norm(subtract(dp.distanceCalculateParams!.position, triPt));
            if (Math.abs(distance - dp.distanceCalculateParams!.distance) > 0.1) {  // you can adjust the error range here
                console.warn('Measurement is inconsistent');
            }
        }
    
        console.log('Estimated user position is', triPt);
        return triPt;
    };

    // 非线性优化获取用户位置
    function triangulationOptimization(connectDevicesInfoList: ConnectedDeciceInfo[]) {

        const objectiveFunction = (userPosition: number[]) => {
            let sum = 0;
            for (let i = 0; i < connectDevicesInfoList.length; i++) {
                const devicePosition = connectDevicesInfoList[i].distanceCalculateParams!.position;
                const dx = userPosition[0] - devicePosition[0];
                const dy = userPosition[1] - devicePosition[1];
                const distance = Math.sqrt(dx * dx + dy * dy);
                sum += (connectDevicesInfoList[i].distanceCalculateParams!.distance - distance) ** 2;
            }
            return sum;
        };
    
        // Initial guess for user position (can be set to a central point or any other educated guess)
        const initialGuess = [0, 0, 0];
    
        const result = numeric.uncmin(objectiveFunction, initialGuess);
        return result.solution;
    };

    const angleDifference = async (connectDevicesInfoList : ConnectedDeciceInfo[], userPosition: {x:number, y:number}) => {

        function computeN(x: number, y: number, theta: number)  {
            //[-180,180]
            //X,Y为设备2坐标,theta为设备1指向设备2的向量与AN向量的夹角
            //设备1,2连线的左边是N为正, 设备12连线的右边是N为负
            //返回值为AN向量的极坐标角度
            const alpha = Math.atan2(y, x)*(180 / Math.PI);
            const beta = alpha + theta;
            return beta;
        }



        let userOrientation = 0;
        let times = 0;
        let zerotimes = 0;

        for(let k=0; k<5; k++){
            const orientation = await getCompassDirection();
            // console.log('orientation', orientation);
            
            
            if(orientation){
                if(orientation === 0){
                    zerotimes++;
                    if(zerotimes >= 2){
                        times++;
                    }
                }else{
                    userOrientation = orientation+userOrientation;
                    times++;
                }
            }
        }
        userOrientation = userOrientation/times;
        console.log('userOrientation', userOrientation);

        
        const targetDeviceParams1 = connectDevicesInfoList.filter( params=>{
            return /_1$/.test(params.distanceCalculateParams!.deviceName);
        });

        const targetDeviceParams2 = connectDevicesInfoList.filter( params=>{
            return /_2$/.test(params.distanceCalculateParams!.deviceName);
        });

        if(targetDeviceParams1.length === 0 || targetDeviceParams2.length === 0){
            console.log('无法获取两个设备的位置');
            return;
        }

        // 假设A为目标位置,坐标为(0,0), B为设备1, C为设备2, D为用户位置, DA为用户指向目标位置的向量, DF为用户面对方向的单位向量
        const angleN = computeN(targetDeviceParams2[0].distanceCalculateParams!.position[0], targetDeviceParams2[0].distanceCalculateParams!.position[1], targetDeviceParams1[0].distanceCalculateParams!.angle);//计算AN向量极坐标角度(A为设备1)
        const angleDA = cartesianToPolar(userPosition.x, userPosition.y);//计算用户位置向量极坐标角度

        console.log('angleN', angleN);
        console.log('angleDA', angleDA);

        const pointN:Vector2D = {
            x: Math.cos(angleN * (Math.PI / 180)),
            y: Math.sin(angleN * (Math.PI / 180)),
        }

        console.log('pointN', pointN);
        const pointF:Vector2D = {
            x: Math.cos((angleN-userOrientation) * (Math.PI / 180)),
            y: Math.sin((angleN-userOrientation) * (Math.PI / 180)),
        }
        console.log('pointF', pointF);
        console.log('angleF', Math.atan2(pointF.y, pointF.x)*(180 / Math.PI));

        const vectorDA:Vector2D = {
            x: -userPosition.x,
            y: -userPosition.y,
        }
        const cosDA_AF = ((vectorDA.x*pointF.x)+(vectorDA.y*pointF.y))/(magnitude(vectorDA));

        let alpha = Math.acos(cosDA_AF)*(180 / Math.PI);

        

        if(crossProduct(pointF, userPosition) > 0){
            alpha = -alpha;
        }

        console.log('alpha', alpha);
        return alpha;


    };

        
    const getCompassDirection = (): Promise<number | null> => {
        return new Promise((resolve, reject) => {
            try {
                NativeModules.CompassModule.getDirection((direction: number) => {
                    // 北方向为0度, 左转为增大, 右转为减小
                    direction = 360-direction;
                    while (direction < 0) {
                        direction += 360;
                    }
                    if (direction > 360) {
                        direction = direction % 360;
                    }
                    if (direction > 180) {
                        direction = direction - 360;
                    }
                    // console.log('Direction:', direction);
                    resolve(direction);  // 解决promise并返回方向
                });
            } catch (error) {
                console.error(error);
                reject(null);  // 如果出现错误，拒绝promise并返回null
            }
        });
    };

    

   
    
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

