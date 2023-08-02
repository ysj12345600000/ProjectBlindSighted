import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback} from 'react';
import {Alert} from 'react-native';
import { Buffer } from 'buffer';
import {PermissionsAndroid, Platform} from 'react-native';
import {BleError,BleManager,Characteristic,Device, Service} from 'react-native-ble-plx';
import {PERMISSIONS, requestMultiple} from 'react-native-permissions';
import DeviceInfo from 'react-native-device-info';
import {DsitanceCalculateParams} from './triangulationCalculater';


type VoidCallback = (result: boolean) => void;
const manager = new BleManager();

interface ConnectedDeciceInfo{
    devce : Device;
    index : number;
    rssiList : number[];
    // 服务信息
    notifyCharacteristicUUID: string;
    serviceId: string;
    writeCharacteristicUUID: string;

    // 回复信息
    responeseContext : string;

    // 计算距离参数
    distanceCalculateParams : DsitanceCalculateParams;

}


interface BleManagerContextProps {

    
  }
  
const BleManagerContext = createContext<BleManagerContextProps|null>({} as BleManagerContextProps);
  
export const useBleManager = () =>{
    const context = useContext(BleManagerContext);
    if (!context) {
      throw new Error('useBleManager must be used within a BleManagerContextProvider');
    }
    return context;
  }
  
interface BleManagerContextProviderProps {children: ReactNode;}

export const BleManagerContextProvider = ({ children }: BleManagerContextProviderProps) => {
    let MAXATTEMPTTIMES = 3;
    let RETRY_DELAY = 500;

    const [isBleOpen, setIsBleOpen] = useState(false);
    const [isSearchBle, setIsSearchBle] = useState(false);
    const [deviceList, setDeviceList] = useState<Device[]>([]);
    const [targetMacIds, setTargetMacIds] = useState<string[]>([]);
    const [connectedDevicesInfo, setConnectedDevicesInfo] = useState<ConnectedDeciceInfo[]>([]);
    const 


    

    





    const value = {
       
        

    };
    return <BleManagerContext.Provider value={value}>{children}</BleManagerContext.Provider>;
}
export default useBleManager;