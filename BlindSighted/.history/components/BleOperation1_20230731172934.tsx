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
    device : Device;
    index : number;
    // 服务信息
    notifyCharacteristicUUID: string;
    serviceId: string;
    writeCharacteristicUUID: string;

    // 回复信息
    responeseContext : string;

    // 计算距离参数
    distanceCalculateParams : DsitanceCalculateParams | null;

}

interface RssiInfo{
    index : number;
    macId : string;
    rssiList : number[];
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
    let MAX_ATTEMPT_TIMES = 3;
    let RETRY_DELAY = 500;
    let MAX_RSSI_LENGTH = 50;

    const [isBleOpen, setIsBleOpen] = useState(false);
    const [isSearchBle, setIsSearchBle] = useState(false);
    const [deviceList, setDeviceList] = useState<Device[]>([]);
    const [targetMacIds, setTargetMacIds] = useState<string[]>([]);
    const [isTogglingBle, setIsTogglingBle] = useState(false);
    const [isAllowRssiScan, setIsAllowRssiScan] = useState(false);

    const [distanceCalculateParamsList, setDistanceCalculateParamsList] = useState<DsitanceCalculateParams[]>([]);
    const [connectedDevicesInfo, setConnectedDevicesInfo] = useState<ConnectedDeciceInfo[]>([]);
    const [rssiLists, setRssiLists] = useState<RssiInfo[]>([]);


    // 初始化及获取权限
    useEffect(() => {
        const subscription = manager.onStateChange((state) => {
          if (state === 'PoweredOff') {
            setDeviceList([]);
            setConnectedDevicesInfo([]);         
            setIsBleOpen(false);
            Alert.alert('蓝牙已关闭, 请打开蓝牙设备');
          }
    
          if (state === 'PoweredOn') {
            setIsBleOpen(true);
          }
        }, true);

        setTargetMacIds(['34:85:18:6E:5B:19','34:85:18:42:4E:39','34:85:18:6E:D4:C5'])
        requestPermissions((granted: boolean) => {
          if (!granted) {
            Alert.alert('Permission Required', 'This app needs bluetooth permissions to function properly');
          }
        });
    
        return () => {
          subscription.remove();
        };
    }, [isBleOpen]);

    const requestPermissions = useCallback( async (cb: VoidCallback) => {
        if (Platform.OS === 'android') {
            const apiLevel = await DeviceInfo.getApiLevel();

            if (apiLevel < 31) {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                {
                title: 'Location Permission',
                message: 'Bluetooth Low Energy requires Location',
                buttonNeutral: 'Ask Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
                },
            );
            cb(granted === PermissionsAndroid.RESULTS.GRANTED);
            } else {
            const result = await requestMultiple([
                PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
                PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
                PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
            ]);

            const isGranted =
                result['android.permission.BLUETOOTH_CONNECT'] ===
                PermissionsAndroid.RESULTS.GRANTED &&
                result['android.permission.BLUETOOTH_SCAN'] ===
                PermissionsAndroid.RESULTS.GRANTED &&
                result['android.permission.ACCESS_FINE_LOCATION'] ===
                PermissionsAndroid.RESULTS.GRANTED;

            cb(isGranted);
            }
        } else {
            cb(true);
        }
    }, []);
    
    // 搜索蓝牙
    const isDuplicteDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex(device => nextDevice.id === device.id) > -1;

    useEffect(() => {
        if (isTogglingBle) return;
    
        if (isSearchBle) {
            setDeviceList([]);
    
            // 开始扫描
            manager.startDeviceScan(null, null, (error, device) => {
                if (error) {
                    console.error(error);
                    return;
                }
    
                if (device && device.name) {
                    setDeviceList((prevState: Device[]) => {
                        if (!isDuplicteDevice(prevState, device)) {
                            const newState = [...prevState, device];
                            console.log('扫描到设备', device, deviceList);
                            return newState;
                        }
                        return prevState;
                    });
                }
            });
        } else {
            manager.stopDeviceScan();
        }
    }, [isSearchBle]);

    const startSearchBle = () => {
        console.log('开始搜索蓝牙');
        setIsSearchBle(true);
    };

    const stopSearchBle = () => {
        console.log('停止搜索蓝牙');
        setIsSearchBle(false);
    };
    
    // 连接蓝牙
    const connectBle = async (macId:string) => {
        stopSearchBle();

        if(connectedDevicesInfo.some((device => device.device.id === macId))){
            console.log('该设备已连接', deviceList.filter(device => targetMacIds.includes(device.id)));
            startSearchBle;  // 开始搜索蓝牙
            return;
        }

        try{
            const device = await manager.connectToDevice(macId);
            const parts = device.name!.split('_');
            const numberPart = parseInt(parts[parts.length - 1]);

            setConnectedDevicesInfo(preDevices => {
                if(preDevices.some(d => d.device.id === macId)){
                    console.log('该设备已连接', device.name);
                    return preDevices;
                }
                if(preDevices.length === 3){
                    console.log('设备数量已达上限');
                    return preDevices;
                }
                
                let currentConnectedDeviceInfo = {
                    device : device,
                    index : numberPart,
                    rssiList : [],
                    notifyCharacteristicUUID: '',
                    serviceId: '',
                    writeCharacteristicUUID: '',
                    responeseContext : '',
                    distanceCalculateParams : null,
                };

                return [...preDevices, currentConnectedDeviceInfo];
            })
            setRssiLists(prevRssiLists => {
                return [...prevRssiLists, {index: numberPart, macId: macId, rssiList: []}];
            });
            onDisconnect(device.id);
            console.log('连接成功', device.name);
    
            await manager.discoverAllServicesAndCharacteristicsForDevice(macId);
            
            if( numberPart=== 1){
                (async () => {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                    await getServiceID(macId);
                    await startNoticeBle(macId);
                    await bleWirte(macId, 'GETDEVICEINFO');
                })();
            }


        } catch(error) {
            console.log('连接失败', error);
        } finally {
            if(connectedDevicesInfo.length < 3){
                startSearchBle;  // 开始搜索蓝牙
            }
        }

    };

    useEffect(() => {
        if (connectedDevicesInfo.length === 3 && distanceCalculateParamsList.length === 3) {
            const updatedDevices = connectedDevicesInfo.map(deviceInfo => {
                const distanceCalculateParams = distanceCalculateParamsList.find(params => params.macId === deviceInfo.device.id);
                if (distanceCalculateParams) {
                    return {
                        ...deviceInfo,
                        distanceCalculateParams: distanceCalculateParams,
                    };
                }
                return deviceInfo;  // 如果没有找到，返回原来的deviceInfo
            });
    
            setConnectedDevicesInfo(updatedDevices);
        }
    }, [connectedDevicesInfo, distanceCalculateParamsList]);


    // 断开蓝牙
    const disconnectBle = async (macId:string) => {
        if(connectedDevicesInfo.some((device => device.device.id === macId))){
            manager.cancelDeviceConnection(macId).then((res) => {
                console.log('断开连接成功', res);
                // 从已连接设备列表中移除
                setConnectedDevicesInfo(prevDevices => prevDevices.filter(device => device.device.id !== macId));
              }).catch((err) => {
                console.error('断开连接失败', err);
            });
        }else{
            console.log('该设备未连接', macId);
        }
    };

    // 监听连接状态
    const onDisconnect = (macId:string) => {
        const subscription = manager.onDeviceDisconnected(macId, (error, device) => {
            if (error) {
                console.error('监听连接状态失败', error);
            }else{
                console.log('监听连接状态成功:蓝牙已断开', device);
                // 从已连接设备列表中移除
                setConnectedDevicesInfo(prevDevices => prevDevices.filter(device => device.device.id !== macId));
            }
        });
        return ()=>{
            subscription.remove();
        }
    };

    //设备通讯
    const getDeviceInfo=  (macId: string): ConnectedDeciceInfo => {
        return connectedDevicesInfo.find(device => device.device.id === macId)!;
    };

    const getServiceID = async (macId: string) => {
        try{
            const services = await manager.servicesForDevice(macId);
            console.log('获取服务成功', macId, services);
            let serviceUUID = services[2].uuid;
            await getCharacterIdNotify(serviceUUID, macId);
        } catch(error){
            console.error('获取服务失败', error);
        }
    };

    const getCharacterIdNotify = async (serviceUUID : string, macId : string) => {
        try{
            const device = await manager.isDeviceConnected(macId);
            if(!device){
                console.log('设备未连接');
                return null;
            }
            const characteristics = await manager.characteristicsForDevice(macId, serviceUUID);
            console.log('获取特征值成功', macId, characteristics);
            if (characteristics.length < 2) {
                console.error("Expected at least 2 characteristics, but got less.");
                return null;
            }
            
            setConnectedDevicesInfo(prevDevices => prevDevices.map(deviceInfo=>{
                if(deviceInfo.device.id === macId){
                    return {
                        ...deviceInfo,
                        notifyCharacteristicUUID : characteristics[0].uuid,
                        writeCharacteristicUUID : characteristics[1].uuid,
                        serviceId : characteristics[1].serviceUUID,
                    };
                }
                return deviceInfo;
            }));
        } catch(error){
            console.error('获取特征值失败', error);
        }
    };

    const startNoticeBle = async (macId: string) => {
        const decodeFormatMessage2DsitanceCalculateParams = (macId : string, rescontext: string) => {
            let deviceInfo = rescontext.split(':');
            let deviceInfoList = deviceInfo[1].split(',');
            console.log('设备信息', deviceInfoList);
            const dsitanceCalculateParams: DsitanceCalculateParams = {
                macId: macId, 
                deviceName: deviceInfoList[11],
                rssiRef: parseFloat(deviceInfo[4]),
                rssiList: [],
                position: [parseFloat(deviceInfoList[0]), parseFloat(deviceInfoList[1]), parseFloat(deviceInfoList[2])],
                x: 0, 
                A: parseFloat(deviceInfoList[5]),
                H: parseFloat(deviceInfoList[6]),
                N: parseFloat(deviceInfoList[7]),
                P: parseFloat(deviceInfoList[8]),
                Q: parseFloat(deviceInfoList[9]),
                R: parseFloat(deviceInfo[10]),
                distance: -1,
                angle: parseFloat(deviceInfoList[3])
            };
            console.log('设备信息', dsitanceCalculateParams);
            setDistanceCalculateParamsList(prevParams => {
                if(prevParams.some(params => params.macId === macId)){
                    return prevParams;
                }
                return [...prevParams, dsitanceCalculateParams];
            });
        };
        const deviceInfo = await getDeviceInfo(macId);
        if(!deviceInfo){console.log('设备未连接'); return;}

        const subscription = manager.monitorCharacteristicForDevice(macId, deviceInfo.serviceId, deviceInfo.notifyCharacteristicUUID, (error, characteristic) => {
            if (error) {
                console.error('监听失败', error);
                return;
            }
            if(characteristic){
                let rescontext = Buffer.from(characteristic.value!, 'base64').toString('utf8');
                if (rescontext.includes('DEVICEINFO:')) {
                    decodeFormatMessage2DsitanceCalculateParams(macId, rescontext);
                }
                console.log('监听成功', macId, rescontext);
            }
        }, 'monitor');
        return ()=>{
            subscription.remove();
        }
    };

    const bleWirte = async (macId: string, data: string) => {
        const deviceInfo = await getDeviceInfo(macId);
        if(!deviceInfo){console.log('设备未连接'); return;}

        let formatData = Buffer.from(data, 'utf8').toString('base64');
        console.log('发送数据:', deviceInfo, formatData);
        
        manager.writeCharacteristicWithResponseForDevice(macId, deviceInfo.serviceId, deviceInfo.writeCharacteristicUUID, formatData).then((characteristic) => {
            let resData = Buffer.from(characteristic.value!, 'base64').toString('utf8');
            console.log('发送成功', resData);
        }).catch((err) => {
            console.error('发送失败', err);
        });

    };

    // 监听RSSI

    useEffect(() => {
        let isCancelled = false;
    
        const recursiveScan = async () => {
            if (!isAllowRssiScan || isCancelled) return;
            await getRSSIList();
            if (!isCancelled) recursiveScan();
        };
    
        if (isAllowRssiScan) {
            recursiveScan();
        }
    
        return () => {
            isCancelled = true;
        };
    }, [isAllowRssiScan, connectedDevicesInfo]);

    const addRssiToList = (id: string, DeviceForRssi:) => {

    
        
        setRssiLists(prevRssiLists => {
            const updatedRssiLists = prevRssiLists.map(rssiList => {
                if (rssiList.macId === id) {
                    return {
                        ...rssiList,
                        rssiList: [...rssiList.rssiList, rssi].slice(-MAX_RSSI_LENGTH),
                    };
                }
                return rssiList;
            });
            return updatedRssiLists;
        });
    };

    const getRSSIList = async () => {
        if(connectedDevicesInfo.length === 0){return;}

        for(const deviceInfo of connectedDevicesInfo){
            const DeviceForRssi = await deviceInfo.device.readRSSI();
            addRssiToList(deviceInfo.device.id, rssi);







    

    





    const value = {
       
        

    };
    return <BleManagerContext.Provider value={value}>{children}</BleManagerContext.Provider>;
}
export default useBleManager;